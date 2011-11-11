#!/usr/bin/env python
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

from collections import defaultdict
import copy
import csv
import glob
import logging
from unicodewriter import UnicodeDictWriter, UnicodeDictReader
from optparse import OptionParser
import os
from osgeo import osr
import psycopg2
import simplejson
import shlex
import StringIO
import subprocess
import sys
import time
import urllib
import yaml
from providerconfig import ProviderConfig

def ogr2ogr_path():
    """ Determines and returns the path to ogr2ogr. """

    # For Macs which have GDAL.framework, we can autodetect it
    # and use it automatically.

    ogr2ogr_path = '/Library/Frameworks/GDAL.framework/Programs/ogr2ogr'
    if not os.path.exists(ogr2ogr_path):
        # We don't have a path to use; let subprocess.call
        # find it.
        ogr2ogr_path = 'ogr2ogr'

    return ogr2ogr_path

def convertToJSON(dir):
    """Converts the given directory into a JSON file (stored in the directory itself as 'all.json').

    If '$dir/all.json' already exists, it will be overwritten.
    """

    original_dir = os.path.abspath(os.path.curdir)
    os.chdir(dir)
    logging.info("Processing directory '%s'." % dir)

    # We wrap this processing in a try-finally so that, no matter what happens,
    # we change back to the original directory before we leave this subroutine.
    try:
        # Step 1. Load and validate the config.yaml file.
        config = ProviderConfig("config.yaml", os.path.basename(dir))
        config.validate()

        all_features = []

        # Step 2. For each collection, and then each shapefile in that collection:
        for collection in config.collections():
            os.chdir(collection.getdir())

            logging.info("Switching to collection '%s'." % collection.getdir())

            shapefiles = glob.glob('*.shp')
            for shapefile in shapefiles:

                # Determine the "name" (filename without extension) of this file.
                name = shapefile[0:shapefile.index('.shp')]

                # Step 2.1. Convert this shapefile into a GeoJSON file, projected to
                # EPSG 4326 (WGS 84).
                json_filename = '%s.json' % name

                if os.path.exists(json_filename):
                    os.remove(json_filename)

                command = [ogr2ogr_path(), 
                    '-f', 'GeoJSON', 
                    '-t_srs', 'EPSG:4326',
                    json_filename,
                    '%s.shp' % name
                ]
                logging.info('Converting shapefile to GeoJSON: %s.shp' % name)
                subprocess.call(command)

                # Step 2.2. Load that GeoJSON file and do the mapping.
                logging.info('Mapping fields from DBF to specification: %s' % json_filename)
                geojson = simplejson.loads(open(json_filename).read())

                # Step 2.3. For every feature:
                row_count = 0
                for feature in geojson['features']:
                    row_count = row_count + 1

                    properties = feature['properties']
                    new_properties = collection.default_fields()

                    # Map the properties over.
                    for key in properties.keys():
                        (new_key, new_value) = collection.map_field(row_count, key, properties[key])
                        if new_value is not None:
                            new_properties[new_key] = new_value
               
                    # Replace the existing properties with the new one.
                    feature['properties'] = new_properties
                    all_features.append(feature)
                    
                logging.info('Fields mapped successfully.')

            os.chdir('..')

        # All finished! Write out 'all.json'.
        all_json = open("all.json", "w")
        simplejson.dump({
            'type': "FeatureCollection",
            'features': all_features
        }, all_json, indent="  ")
        all_json.close()
        logging.info("'%s/all.json' written successfully." % dir)

    finally:
        os.chdir(original_dir)

    logging.info("Processing of directory '%s' completed." % dir)

def _getoptions():
    ''' Parses command line options and returns them.'''
    parser = OptionParser()
    parser.add_option('-s', '--source_dir',
                      type='string',
                      dest='source_dir',
                      help='Directory containing source to load.')
    parser.add_option('--no-validate', '-V',
                      action="store_true",
                      dest="no_validate",
                      help="Turns off validation of the config.yaml files being processed."
    )

    return parser.parse_args()[0]

def main():
    logging.basicConfig(level=logging.DEBUG)
    options = _getoptions()

    if options.source_dir is not None:
        if os.path.isdir(options.source_dir):
            logging.info('Processing source directory: %s' % options.source_dir)
            convertToJSON(options.source_dir)
            sys.exit(0)
        else:
            logging.info('Unable to locate source directory %s.' % options.source_dir)
            sys.exit(1)
    else:
        source_dirs = [x for x in os.listdir('.') if os.path.isdir(x)]

        # Remove some directories used internally.
        source_dirs.remove('logs')
        source_dirs.remove('progress')

        logging.info('Processing source directories: %s' % source_dirs)
        for sd in source_dirs: # For each source dir (e.g., jetz, iucn)
            if not os.path.exists(sd + "/config.yaml"):
                logging.info('Directory "%s": No config.yaml found, ignoring directory.' % sd)
            else:
                convertToJSON(sd)

    logging.info('Processing completed.')

if __name__ == '__main__':
    main()


def x():
    if 1:
        if 2:
            if 3:
                for source, mols in collection.get_mapping().iteritems(): # Required DBF fields

                    # Source may be blank for required fields, which is wrong.
                    if source is None or source == '':
                        logging.error('Required field(s) %s are not mapped to any value. Please check %s/config.yaml!' \
                                          % (", ".join(mols), source_dir))
                        sys.exit(1)

                    for mol in mols:
                        if unicode(source)[0] == '=':
                            # Map a DBF column to a field.
                            # For case-insensitivity, we lowercase all field names.
                            source_name = source[1:].lower()

                            sourceval = dbf.get(source_name)
                            if not source_name in dbf:
                                logging.error('Unable to map required DBF field %s to %s. Valid fieldnames include: %s.' \
                                                  % (source_name, mol,  ", ".join(dr.fieldnames)))
                                sys.exit(1)
                            row[mol] = sourceval
                            polygon[mol] = sourceval

                        else:
                            # Sets the value of the field based on 'source'
                            row[mol] = source
                            polygon[mol] = source

                for source, mols in collection.get_mapping(required=False).iteritems(): #Optional DBF fields

                    for mol in mols:
                        # Source can be blank for optional fields, which is fine.
                        if source is None or source == '':
                            row[mol] = ''
                            polygon[mol] = ''

                        elif unicode(source)[0] == '=':
                            # Map a DBF column to a field.
                            # For case-insensitivity, we lowercase all field names.
                            source_name = source[1:].lower()

                            # Map a DBF column to a field.
                            sourceval = dbf.get(source_name)
                            if not source_name in dbf:
                                logging.error('Unable to map optional DBF field %s to %s. Valid fieldnames include: %s.' % (source_name, mol, ", ".join(dr.fieldnames)))
                                sys.exit(1)
                            row[mol] = sourceval
                            polygon[mol] = sourceval

                        else:
                            # Sets the value of the field based on 'source'
                            row[mol] = source
                            polygon[mol] = source

                # MOL-calculated fields (see issue #120) will eventually be calculated here.
                # For now, that's just 'provider', 'contributor' and 'filename'.
                row['filename'] = row['layer_filename'].lower()

                # Update the collectin GeoJSON
                geojson['features'][row_count]['properties'] = copy.copy(row)
                coll_geojson['features'].append(geojson['features'][row_count])

                row_count += 1

            csv_file.close()

            # Create JSON representation of dbfjson
            polygons_json = simplejson.dumps(layer_polygons) # TODO: Showing up as string instead of JSON in API
            d=dict(shapefilename=row['layer_filename'], json=polygons_json)
            poly_dw.writerow(dict(shapefilename=row['layer_filename'], json=polygons_json))
        poly_file.flush()
        poly_file.close()
        
        open('all.json', 'w').write(simplejson.dumps(coll_geojson))

        # Important: Close the DictWriter file before trying to bulkload it
        logging.info('All collection metadata saved to %s' % coll_file.name)
        logging.info('All collection polygons saved to %s' % poly_file.name)
        coll_file.flush()
        coll_file.close()

        # Bulkload...

        # os.chdir(current_dir)
        if not options.dry_run:
            os.chdir(original_dir)
            filename = '%s/%s/collection.csv.txt' % (source_dir, coll_dir)

            # Before we upload our metadata to Google App Engine, we should
            # upload our metadata to PostgreSQL.

            # TODO: We probably want to let people turn this off,
            # maybe if the 'db.json' file is missing.

            # First, we load up the metadata and gently massage it
            # into a format the PostgreSQL COPY FROM can understand.
            # We store it in an in-memory "StringIO" file.
            file = open(filename, 'r')
            metadata = UnicodeDictReader(file)
            stringio = StringIO.StringIO()

            tmpcsv = UnicodeDictWriter(
                stringio,
                collection.get_metadata_columns() + ['the_geom_webmercator']
            )

            # Up the field size so we can store 10 MB layer maps into the CSV file.
            csv.field_size_limit(10*1024*1024)

            for row in metadata:
                for key,val in row.iteritems():
                    # PostgreSQL has problems reading newlines in CSV files.
                    # So we re-encode them as literal '\\' '\n'. Since we are
                    # not actually going to display this data, that's probably
                    # fine for now.
                    row[key] = val.replace("\n", "\\n")

                tmpcsv.writerow(row)
            file.close()

            # Move the StringIO back to the start of the file
            # so we can read the CSV from that.
            stringio.seek(0)

            # Time to connect to the database! Read the database
            # settings from db.json.
            if not os.path.exists("db.json"):
                logging.error(
                    """'db.json' not found in the current directory. Please
create a 'db.json' by modifying 'db.json.sample' for your use.""")
                exit(1)

            db_settings = open("db.json", "r")
            settings = simplejson.load(db_settings)
            db_settings.close()

            if 'psycopg2_connect' in settings.keys():
                conn = psycopg2.connect(settings['psycopg2_connect'])
            else:
                # That '**' will convert settings from a dictionary
                # into Python keyword arguments. Just like magic!
                conn = psycopg2.connect(**settings)

            # print "Columns: " + ', '.join(collection.get_metadata_columns() + ['temp_geom'])
            # print "Data: " + stringio.getvalue()

            # Before we add the new rows to the database,
            # we should get rid of all the information
            # we have on this provider/collection. That
            # old collections are effectively "wiped" from
            # the system once we're done with them.
            #
            # This makes more sense to me than replacing
            # individual files, but maybe that's just me.
            cur = conn.cursor()
            cur.execute("DELETE FROM layers WHERE provider=%s AND collection=%s", [source_dir.lower(), coll_dir.lower()])

            # Add the new rows to the database.
            sql = "COPY layers (" + \
                    ', '.join(collection.get_metadata_columns() + ['temp_geom']) + \
                ") FROM STDIN WITH NULL AS '' CSV"
            # logging.info('SQL %s' % sql)

            conn.commit()

            cur.copy_expert(sql, stringio)

            # To debug what's going into PostgreSQL, this is the right way to look at it. 
            #sql = open("%s/%s/debug.csv" % (source_dir, coll_dir), "w")
            #sql.write(stringio.getvalue())
            #sql.close()
            stringio.close()
            
            # TODO: Update the following statement so that:
            #   1. We only copy the geom over where ST_IsValid(temp_geom)
            #   2. We count how many invalid geometries we have, then
            #      report this to the user. Maybe quit entirely? Hmm.
            #   3. Reset the temp_geom to NULL, so we know which rows
            #      have been set correctly.
            cur.execute("UPDATE layers SET the_geom_webmercator=ST_Transform(temp_geom, 4326) WHERE ST_IsValid(temp_geom) AND GeometryType(temp_geom)='MULTIPOLYGON'")
            cur.execute("UPDATE layers SET the_geom_webmercator=ST_Multi(ST_Transform(temp_geom, 4326)) WHERE ST_IsValid(temp_geom) AND GeometryType(temp_geom)='POLYGON'")

            # Fix any invalid polygons.
            cur.execute("UPDATE layers SET the_geom_webmercator=ST_Multi(ST_Transform(ST_Buffer(ST_GeomFromEWKT(temp_geom), 0.0), 4326)) WHERE NOT ST_IsValid(temp_geom) AND ST_IsValid(ST_Multi(ST_Buffer(ST_GeomFromEWKT(temp_geom), 0.0)));")

            # Now, we need to create a CSV to bulkload to Google.
            # TODO: At the moment, we reupload the *entire* database to
            # Google App Engine. This is going to get unwieldy fast.
            # Instead, we ought to only bulkupload rows in *this*
            # provider and collection combination. Unfortunately,
            # there is no easy way to do this: we have to create
            # a temporary table in PostgreSQL.

            filename = os.path.abspath('%s/%s/collection.for-google.csv.txt'
                % (source_dir, coll_dir))
 
            # filename = os.path.abspath('%s/%s/collection.csv.txt' % (source_dir, coll_dir))

            file = open(filename, "w")
            file.write(','.join(collection.get_metadata_columns()) + "\n")
            cur.copy_expert("COPY layers (" +
                ', '.join(collection.get_metadata_columns()) +
                ") TO STDOUT WITH NULL AS '' CSV", file)
            file.close()

            conn.commit()
            cur.close()
            conn.close()

            logging.info("Metadata added to the database.")

            # Upload to Google App Engine!
            if options.config_file is None:
                logging.error("No bulkloader configuration file specified: please specify one with the --config_file option.")
                exit(2) # Since apparently '2' signals that something is wrong in the command line arguments.

            config_file = os.path.abspath(options.config_file)

            if options.localhost:
                options.url = 'http://localhost:8080/_ah/remote_api'

            # *nixes can run appcfg.py as a program without any problem. Windows, however,
            # can only run appcfg.py if run through the shell. Therefore, we set the flag_run_in_shell
            # depending on which operating system we're in.
            flag_run_in_shell = (os.name == 'nt') # True if we're running in Windows; false otherwise.

            # Bulkload Layer entities to App Engine for entire collection
            cmd = [
                'appcfg.py', 'upload_data',
                '--config_file=%s' % config_file,
                '--filename=%s' % filename,
                '--kind=Layer',
                '--url=%s' % options.url,
                '--log_file=logs/bulkloader-log-%s' % time.strftime('%Y%m%d.%H%M%S'),
                '--db_filename=progress/bulkloader-progress-%s.sql3' % time.strftime('%Y%m%d.%H%M%S')
            ]
            subprocess.call(cmd, shell=flag_run_in_shell)

            # Bulkload LayerIndex entities to App Engine for entire collection
            # TODO: Wait, why is the filename the same as above?
            cmd = [
                'appcfg.py', 'upload_data',
                '--config_file=%s' % config_file,
                '--filename=%s' % filename,
                '--kind=LayerIndex',
                '--url=%s' % options.url,
                '--log_file=logs/bulkloader-log-%s' % time.strftime('%Y%m%d.%H%M%S'),
                '--db_filename=progress/bulkloader-progress-%s.sql3' % time.strftime('%Y%m%d.%H%M%S')
            ]
            subprocess.call(cmd, shell=flag_run_in_shell)

            # Now run all the shapefiles through shp2pgis.py

        # Go back to the original directory for the next collection.
        os.chdir(original_dir)

