#!/usr/bin/env python
# vim: set fileencoding=utf-8 :
#
# Copyright 2011 Aaron Steele, John Wieczorek, Gaurav Vaidya
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

"""This script compresses a provider directory into a single all.json file for upload.

"""

import codecs
import csv
import decimal
import glob
import hashlib
import logging
import os
import pprint
import random
import shapely.geometry
import simplejson
import sqlite3
import subprocess
import sys
import time

from cartodb import CartoDB,CartoDBException
from optparse import OptionParser
from zipfile import ZipFile

from providerconfig import ProviderConfig
from unicodewriter import UnicodeDictReader

# The default directory where datasets may be found. Set this back to
# '.' for the old loader.py behavior of looking in subfolders of the
# current directory.
DEFAULT_DATASETS_DIR = 'datasets'

# Some global functions.

def generate_feature_hash(feature):
    """ Generates a hash for a 'geo' feature. The challenge here is to
    ensure that this hash will look the same for ever 'geo' object,
    on every computer, ever. Good luck.
    """

    # We need pformat only because it sorts dictionary keys alphabetically,
    # and will not trip up if we ever have dictionaries-inside-dictionaries,
    # etc.
    str = pprint.pformat(feature)
    
    # We use SHA-1 hashes, rendered as uppercase hexadecimal digits.
    hash = hashlib.sha1(str).hexdigest().upper()

    # print "Hash [%s] generated from «%s»." % (hash, str)
    return hash

# TODO: Best just get rid of this and use a global variable?
class ogr2ogrPathDetection(object):
    """ Determines and returns the path to ogr2ogr. 
    Implemented as a callable object so its return
    value can be easily memoized.
    """

    def __init__(self):
        # For Macs which have GDAL.framework, we can autodetect it
        # and use it automatically.
        path = '/Library/Frameworks/GDAL.framework/Programs/ogr2ogr'
        if not os.path.exists(path):
            # We don't have a path to use; let subprocess.call
            # find it.
            path = 'ogr2ogr'

        self.cached_path = path

    def __call__(self):
        return self.cached_path

# Some global variables.

# ogr2ogr_path(): the path used to 
ogr2ogr_path = ogr2ogrPathDetection()

# The CartoDB object we use to communicate with the server.
cartodb = None

# The CartoDB setting used to login to the server.
cartodb_settings = None

def uploadToCartoDB(provider_dir):
    """Uploads the given directory to CartoDB. At the moment, all collection data is
    deleted on the server during upload (this will be fixed for issue #27).
    """
    
    original_dir = os.path.abspath(os.path.curdir)
    os.chdir(provider_dir)
    logging.info("Now in directory '%s'." % provider_dir)

    # How many SQL statements should we run together?
    sql_statements_to_send_at_once = _getoptions().simultaneous_sql_statements;

    # We wrap this processing in a try-finally so that, no matter what happens,
    # we change back to the original directory before we leave this subroutine.
    try:
        # Step 1. Load and validate the config.yaml file.
        config = ProviderConfig("config.yaml", os.path.basename(provider_dir))
        config.validate()

        # Step 2. Load (or create) a SQLite database to store the upload index.
        sqlite = sqlite3.connect("status.sqlite3")

        upload_index = sqlite.cursor()
        upload_index.execute("""
            CREATE TABLE IF NOT EXISTS uploads (
                source TEXT,            -- or "provider"
                collection TEXT,        -- the collection being uploaded.
                filename TEXT,          -- the filename in the collection
                                        -- (= collection for CSV/TXTs)
                cartodb_tablename TEXT, -- The tablename on CartoDB
                row INTEGER,            -- The row number in the file.
                rows_so_far INTEGER,    -- A running total of the rows
                                        -- uploaded for this file so far.
                                        -- Should be equal to row, but
                                        -- won't be if an upload failed.
                rows_in_upload INTEGER, -- Rows in upload.
                uploaded BOOLEAN        -- Has this record been uploaded?
            );
        """)
        sqlite.commit()

        # Step 3. For each collection, and then each shapefile in that collection:
        for collection in config.collections():
            features = getCollectionIterator(_getoptions().table_name, collection)

            # Delete previous entries from this provider/collection combination.
            if _getoptions().reset_collection:
                logging.info("Deleting previous entries.")
                deletePreviousEntries(_getoptions().table_name, collection.get_provider(), collection.get_collection())
                
            # We currently combine three SQL statements into a single statement for transmission to CartoDB.
            sql_statements = []
            sqlite_rows_added = []

            rows_to_skip = _getoptions().rows_to_skip
            row_count = 0
            for feature in features:
                row_count += 1

                properties = feature['properties']
                new_properties = collection.default_fields()

                if row_count == 1 and _getoptions().reset_collection:
                    logging.info("\tDeleting entries from the upload cache.")
                    upload_index.execute("DELETE FROM uploads WHERE source=? AND collection=? AND filename=? AND cartodb_tablename=?", 
                        (properties['provider'], 
                        properties['collection'], 
                        properties['filename'], 
                        _getoptions().table_name)
                    )
                    sqlite.commit()

                if(rows_to_skip > 0 and row_count <= rows_to_skip):
                    logging.info("\tSkipping row %d (--skip-rows %d in operation)", row_count, rows_to_skip)
                    continue

                # Check if this feature has already been processed.
                upload_index.execute("SELECT 1 FROM uploads WHERE source=? AND collection=? AND filename=? AND cartodb_tablename=? AND row=? AND uploaded=1", 
                    (properties['provider'], 
                    properties['collection'], 
                    properties['filename'], 
                    _getoptions().table_name,
                    properties['row'])
                )
                if upload_index.fetchone() is not None:
                    logging.info("\tSkipping feature #%d: the upload index shows that it has already been uploaded.", row_count)
                    continue

                # Map the properties over.
                for key in properties.keys():
                    (new_key, new_value) = collection.map_field(row_count, key, properties[key])
                    if new_value is not None:
                        # print "Mapping %s as %s." % (new_key, new_value)
                        new_properties[new_key] = unicode(new_value)

                collection.verify_fields(properties['filename'], new_properties)
                feature['properties'] = new_properties

                feature_hash = generate_feature_hash(feature) 
                feature['properties']['FeatureHash'] = feature_hash

                # Prepare SQL for upload to CartoDB.
                logging.info("\tPreparing SQL for feature #%d" % row_count);
                sql_statements.append(encodeGeoJSONEntryAsSQL(feature, _getoptions().table_name))
                
                properties = feature['properties']
                upload_index.execute("INSERT INTO uploads (source, collection, filename, cartodb_tablename, row, rows_so_far, rows_in_upload, uploaded) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
                    (properties['provider'],
                    properties['collection'],
                    properties['filename'],
                    _getoptions().table_name,
                    properties['row'],
                    0, # We are not tracking rows_so_far right now.
                    row_count,
                    0 # This has not yet been uploaded, so FALSE.
                    )
                )
                rowid = upload_index.lastrowid
                sqlite_rows_added.append(rowid)
                sqlite.commit()

                if(len(sql_statements) >= sql_statements_to_send_at_once):
                    logging.info("\tBatch-transmitting %d SQL statements to CartoDB." % len(sql_statements))
                    sendSQLStatementToCartoDB("; ".join(sql_statements))
                    for r in sqlite_rows_added:
                        upload_index.execute("UPDATE uploads SET uploaded = 1 WHERE rowid=?;", [r])
                    sqlite.commit()
                    del sqlite_rows_added[:]
                    del sql_statements[:]

            # Anything still left in sql_statements? Process and upload them now.
            if(len(sql_statements) > 0):
                logging.info("\tBatch-transmitting %d SQL statements to CartoDB." % len(sql_statements))
                sendSQLStatementToCartoDB("; ".join(sql_statements))
                for r in sqlite_rows_added:
                    upload_index.execute("UPDATE uploads SET uploaded = 1 WHERE rowid=?;", [r])
                sqlite.commit()
                del sqlite_rows_added[:]
                del sql_statements[:]
            
            logging.info("Uploaded %d features from collection '%s' (provider '%s').", row_count, collection.get_name(), collection.get_provider());

            # Go back to the provider directory.
            os.chdir(original_dir)
            os.chdir(provider_dir)

        logging.info("Processing of directory '%s' completed." % provider_dir)
        
        # Close the SQL upload index.
        upload_index.close()

    finally:
        os.chdir(original_dir)

    logging.info("Leaving directory '%s'." % provider_dir)

def getCollectionIterator(table_name, collection):
    name = collection.get_name()

    logging.info("Switching to collection '%s'." % name)

    if os.path.isdir(name):
        return getFeaturesFromShapefileDir(collection, name)
    elif os.path.isfile(name) and (
        (name.lower().rfind('.csv', len(name) - 4, len(name)) != -1)
        or
        (name.lower().rfind('.txt', len(name) - 4, len(name)) != -1)):
        return getFeaturesFromLatLongCsvFile(collection, name)

def getFeaturesFromShapefileDir(collection, name):
    os.chdir(name)

    try:
        shapefiles = glob.glob('*.shp')

        # Makes testing easier: for systems which have the files with the same names,
        # we'll upload files in the same order. Won't work where filenames are different.
        # Filenames are stored case-sensitively when uploaded to CartoDB.
        shapefiles.sort()

        for shapefile in shapefiles:
            # Determine the "name" (filename without extension) of this file.
            filename = shapefile[0:shapefile.index('.shp')]

            logging.info("Processing shapefile: %s." % filename)

            # Step 2.1. Convert this shapefile into a GeoJSON file, projected to
            # EPSG 4326 (WGS 84).
            json_filename = '%s.json' % filename
            
            # Delete existing geojson file since we're appending.
            if os.path.exists(json_filename):
                os.remove(json_filename)

            command = [ogr2ogr_path(), 
                '-f', 'GeoJSON', 
                '-t_srs', 'EPSG:4326',
                json_filename,
                '%s.shp' % filename
            ]

            try:
                subprocess.call(command)
            except Exception as e:
                logging.error('Unable to convert %s to GeoJSON: %s (command: %s)' % (name, e, command))
                if os.path.exists(json_filename):
                    os.remove(json_filename)
                continue

            # Step 2.2. Load that GeoJSON file and do the mapping.
            #logging.info('Mapping fields from DBF to specification: %s' % json_filename)
            geojson = None
            try:
                geojson = simplejson.loads(
                    codecs.open(json_filename, encoding='latin-1').read(), 
                    parse_float=lambda x: decimal.Decimal("%.6f" % round(float(x), 6)),
                    encoding='utf-8')

            except Exception as e:
                logging.error('Unable to open or process %s: %s' % (json_filename, e.__str__()))
                exit(1)

            row_count = 0
            for feature in geojson['features']:
                row_count += 1
                properties = feature['properties']
                properties['provider'] = collection.get_provider()
                properties['collection'] = collection.get_name()
                properties['filename'] = filename + ".shp"
                properties['row'] = row_count
                yield feature

    finally:
        # Return to the provider dir.
        os.chdir('..')

def getFeaturesFromLatLongCsvFile(collection, filename):
    # This is a .csv file! 
    csvfile = open(filename, "r")
    if filename[-3:] == 'csv':
        reader = UnicodeDictReader(csvfile)
    if filename[-3:] == 'txt':
        reader = UnicodeDictReader(csvfile, dialect=csv.excel_tab)

    features = []
    feature_index = 0
    for entry in reader:
        feature_index += 1
        feature = {}

        # As per the spec at http://geojson.org/geojson-spec.html
        feature['type'] = 'Feature'
        feature['properties'] = entry

        lat = entry['Latitude']
        if not lat:
            logging.warn("Feature %d has no latitude, ignoring." % feature_index)
            continue # Ignore features without latitudes.
        long = entry['Longitude']
        if not long:
            logging.warn("Feature %d has no longitude, ignoring." % feature_index)
            continue # Ignore features without longitudes.

        feature['geometry'] = {'type': 'Point', 'coordinates': [
                float(entry['Longitude']),
                float(entry['Latitude'])
            ]}
            # TODO: We assume latitude and longitude (in WGS84) are
            # present in the columns 'Latitude' and 'Longitude'
            # respectively.
        
            # IMPORTANT TODO: at the moment, we assume the incoming coordinates
            # are already in WGS84! THIS MIGHT NOT BE TRUE!

        properties = feature['properties']
        properties['provider'] = collection.get_provider()
        properties['collection'] = collection.get_name()
        properties['filename'] = filename
        properties['row'] = feature_index
                
        yield(feature)

    csvfile.close()

def deletePreviousEntries(table_name, provider, collection):
    """Delete previous database entries refering to this provider/collection combination.

    Arguments:
        table_name: The name of the table to delete rows in.
        provider: The provider whose entries are to be delete.
        collection: The collection within that provider's entries to be deleted.
            Only rows matching BOTH the provider and the collection will be
            deleted.

    Returns: none.
    """

    # Generate a 'tag', by calculating a SHA-1 hash of the concatenation
    # of the current time (in seconds since the epoch) and the string
    # representation of the property values in the order that Python is
    # using on our system. The 40-hexadecimal character hash digest so
    # produced is prepended with the string 'tag_', since only a valid
    # identifier (starting with a character) may be a tag.
    #
    # So as to have smaller requests, we use 8 character tags (from
    # position 20-28 of the SHA-1 hexdigest).
    tag = "$tag_" + hashlib.sha1( 
        time.time().__str__() + 
        provider + '/' + collection
        ).hexdigest()[20:28] + "$"

    # Delete any previous entries stored under this provider(source)/collection.
    sql = "DELETE FROM %(table_name)s WHERE provider=%(provider)s AND collection=%(collection)s;" % {
        'table_name': table_name,
        'provider': tag + provider + tag,
        'collection': tag + collection + tag
    }

    sendSQLStatementToCartoDB(sql)

def encodeGeoJSONEntryAsSQL(entry, table_name):
    """Encodes a GeoJSON entry (i.e. an object fulfilling the Python 'geo' interface)
    into a CartoDB statement for upload to CartoDB.

    Arguments:
        entry: A GeoJSON row entry containing geometry and field information for upload.
        table_name: The name of the table to add this GeoJSON entry to.

    Returns: none.
    """
    
    # Determine the geometry for this object, by converting the GeoJSON
    # geometry representation into WKT.
    # geometry = "SRID=4326;" + shapely.geometry.asShape(entry['geometry']).wkb
    try:
        shape = shapely.geometry.asShape(entry['geometry'])
        bounds = shape.bounds
	geometry = shape.wkb.encode('hex')
		# We can use SRID=4326 because we loaded it in that SRID from
		# ogr2ogr.
    except ValueError as e:
	logging.error("Error parsing '%s' as geometry: %s" % (entry['geometry'], e))
	# So we continue, skipping only this feature.
	# Run the upload again to catch these "missing features".
	return ""

    # Store the bounds in the upload object.
    properties = entry['properties']
    properties['minx'] = bounds[0]
    properties['miny'] = bounds[1]
    properties['maxx'] = bounds[2]
    properties['maxy'] = bounds[3]

    # Get the fields and values ready to be turned into an SQL statement
    fields = properties.keys()
    # oauth2 has cannot currently send UTF-8 data in the URL. So we go 
    # back to ASCII at this point. This can be fixed by waiting for oauth2
    # to be fixed (https://github.com/simplegeo/python-oauth2/pull/91 might
    # be a fix), or we can clone our own python-oauth2 and fix that.
    # Another alternative would be to use POST and multipart/form-data,
    # which is probably the better long term solution anyway.
    # values = [unicode(v).encode('ascii', 'replace') for v in properties.values()]
    values = [unicode(v).encode('ascii', 'xmlcharrefreplace') for v in properties.values()]
        # 'values' will be in the same order as 'fields'
        # as long as there are "no intervening modifications to the 
        # dictionary" [http://docs.python.org/library/stdtypes.html#dict]



    # Generate a 'tag', by calculating a SHA-1 hash of the concatenation
    # of the current time (in seconds since the epoch) and the string
    # representation of the property values in the order that Python is
    # using on our system. The 40-hexadecimal character hash digest so
    # produced is prepended with the string 'tag_', since only a valid
    # identifier (starting with a character) may be a tag.
    #
    # So as to have smaller requests, we use 8 character tags (from
    # position 20-28 of the SHA-1 hexdigest).
    tag = "$tag_" + hashlib.sha1( 
        time.time().__str__() + 
        properties.values().__str__()
        ).hexdigest()[20:28] + "$"

    # Turn the fields and values into an SQL statement.
    sql = "INSERT INTO %(table_name)s (the_geom, %(cols)s) VALUES (%(st_multi)s(GeomFromWKB(decode(%(geometry)s, 'hex'), 4326)), %(values)s)" % {
            'table_name': table_name,
            'geometry': tag + geometry + tag,
            'cols': ", ".join(fields),
            'st_multi': "ST_Multi" if (entry['geometry']['type'] == 'Polygon') else "",
            'values': tag + (tag + ", " + tag).join(values) + tag
        }

    return sql

def sendSQLStatementToCartoDB(sql):
    """ A helper method for sending an SQL statement (or multiple SQL statements in a 
    single string) to CartoDB. Note that cartodb is only initialized once; it is stored
    as a global, and reused on subsequent calls.
    """

    global cartodb
    global cartodb_settings

    if cartodb is None:
        cartodb = CartoDB(
            cartodb_settings['CONSUMER_KEY'],
            cartodb_settings['CONSUMER_SECRET'],
            cartodb_settings['user'],
            cartodb_settings['password'],
            cartodb_settings['user'],
            host=cartodb_settings['domain'],
            protocol=cartodb_settings['protocol'],
            access_token_url=cartodb_settings['access_token_url']
        )
        
    # Do these changes as a single transaction:
    sql = "BEGIN TRANSACTION; " + sql + "; COMMIT TRANSACTION;"

    # print "Executing SQL: «%s»" % sql
    if not _getoptions().dummy_run:
        tries = 50

        while (tries > 0):
            try:
                result = cartodb.sql(sql)
            	tries = 0
            except CartoDBException as e:
                #if str(e) == 'internal server error' or str(e) == 'current transaction is aborted, commands ignored until end of transaction block':
                logging.info("\t  CartoDB exception caught ('%s'), retrying ...", e)
                result = None
                tries = tries - 1 

        if result is None:
            logging.error("\t  ERROR! Unable to execute SQL statement <<%s>>; continuing.")
            return

        logging.info("\t  Result: %s" % result)
    else:
        logging.info("\t  SQL statement to execute: %s" % sql)
        logging.info("\t  Result: none (dummy run in progress)")

cmdline_options = None
def _getoptions():
    ''' Returns the parsed command line options.'''

    global cmdline_options
    while cmdline_options is None:
        cmdline_options = parse_cmdline()

    return cmdline_options

def parse_cmdline():
    ''' Parses command line options and returns them.'''
    parser = OptionParser()
    parser.add_option('-s', '--source_dir',
                      type='string',
                      dest='source_dir',
                      help='Directory containing source to load.')
    parser.add_option('-t', '--table',
                      type="string",
                      action="store",
                      dest="table_name",
                      default="temp_geodb",
                      help="The CartoDB table to load the data into.")
    parser.add_option("-c", "--cartodb",
                      type="string",
                      action="store",
                      dest="cartodb_json",
                      default="cartodb.json",
                      help="The cartodb.json you wish you read CartoDB settings from.")
    parser.add_option('-j', '--simultaneous-sql',
                      type="int",
                      action="store",
                      dest="simultaneous_sql_statements",
                      metavar="N",
                      default="3",
                      help="How many SQL statements should we upload at once?")
    parser.add_option('--no-validate', '-V',
                      action="store_true",
                      dest="no_validate",
                      help="Turns off validation of the config.yaml files being processed."
    )
    parser.add_option('--dummy', '-d',
                      action="store_true",
                      dest="dummy_run",
                      help="Performs all steps (including generating SQL statements for CartoDB) but without uploading any data."
    )
    parser.add_option('--replace', '-R',
                      action="store_true",
                      dest="replace",
                      help="Replace existing records, even if their hashes match existing records on the database."
    )
    parser.add_option('--reset', '-D',
                      action="store_true",
                      dest="reset_collection",
                      help="Resets the table by deleting all records in a collection before uploading that collection."
    )
    parser.add_option('--marktime',
                      action="store_true",
                      dest="mark_time",
                      help="Turns on millisecond timing in the output, so that the time between messages can be tracked."
    )
    parser.add_option('--skip-rows',
                      type="int",
                      action="store",
                      dest="rows_to_skip",
                      metavar="N",
                      default="0",
                      help="How many rows should we skip before starting the upload? TURNS OFF DUPLICATION CHECKING."
    )

    return parser.parse_args()[0]


def main():
    """ The main() method; code execution begins here unless this
    file has been imported as a library. This method determines which
    directories the user has decided should be uploaded, and then calls
    uploadToCartoDB() on those directories."""
    
    options = _getoptions()
    if options.mark_time:
        logging.basicConfig(level=logging.DEBUG, format="%(levelname)s:%(module)s:%(relativeCreated)d:%(message)s")
    else:
        logging.basicConfig(level=logging.DEBUG)

    # Load up the cartodb settings: we'll need them later.
    global cartodb_settings
    try:
        cartodb_settings = simplejson.loads(
            codecs.open('cartodb.json', encoding='utf-8').read(), 
            encoding='utf-8')
    except Exception as ex:
        logging.error("Could not load CartoDB setting file 'cartodb.json': %s" % ex)
        exit(1)

    # Has the user provided a source directory? 
    if options.source_dir is None:
        # Go to DEFAULT_DATASETS_DIR and process all the subfolders
        # therein.

        source_dirs = [x for x in os.listdir(DEFAULT_DATASETS_DIR) 
            if os.path.isdir(os.path.join(DEFAULT_DATASETS_DIR, x))]

        logging.info('Processing source directories in %s: %s' % (DEFAULT_DATASETS_DIR, source_dirs))
        for sd in source_dirs: # For each source dir (e.g., jetz, iucn)
            if not os.path.exists(os.path.join(DEFAULT_DATASETS_DIR, sd, "config.yaml")):
                logging.info('Directory "%s": No config.yaml found, ignoring directory.' % sd)
            else:
                uploadToCartoDB(os.path.join(DEFAULT_DATASETS_DIR, sd))

    else:
        # Process the source directory specified.

        if os.path.isdir(options.source_dir):
            source_dir = os.path.normpath(options.source_dir)

            logging.info('Processing source directory: %s' % source_dir)
            uploadToCartoDB(source_dir)
            sys.exit(0)
        else:
            logging.info('Unable to locate source directory %s.' % options.source_dir)
            sys.exit(1)

    logging.info('Processing completed.')

if __name__ == '__main__':
    main()
