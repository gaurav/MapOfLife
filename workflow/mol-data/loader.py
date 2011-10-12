#!/usr/bin/env python
#
# Copyright 2011 Aaron Steele and John Wieczorek
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

"""This script implements the MoL workflow process for layers."""

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
import shapefile
import simplejson
import shlex
import StringIO
import subprocess
import sys
import time
import urllib
import yaml

class Config(object):
    """Wraps the YAML object for a MoL config.yaml object."""

    @classmethod
    def lower_keys(cls, x):
        """Lower cases all nested dictionary keys."""
        if isinstance(x, list):
            return [cls.lower_keys(v) for v in x]
        if isinstance(x, dict):
            return dict((k.lower(), cls.lower_keys(v)) for k, v in x.iteritems())
        return x

    class Collection(object):
        def __init__(self, filename, collection, provider):
            self.filename = filename
            self.collection = collection

            # Set up collection information.
            fields = self.collection['fields']
            if 'required' in fields:
                fields['required']['provider'] = provider.lower()
                fields['required']['collection'] = self.collection['collection'].lower()

            if not _getoptions().no_validate:
                self.validate()

        def __repr__(self):
            return str(self.__dict__)

        def get_row(self):
            row = {}
            return row

        def get_columns(self):
            cols = self.get_metadata_columns()
            cols.extend(['layer_source', 'layer_collection', 'layer_filename', 'layer_polygons'])
            return cols

        def get_metadata_columns(self):
            """Returns columns storing metadata (which is all of them except the generated ones)."""
            cols = []
            cols.extend(self.collection['fields']['required'].keys())
            cols.extend(self.collection['fields']['optional'].keys())
            return cols

        def get_mapping(self, required=True):
            """Returns a reverse fields for convienience."""
            if required:
                mapping = self.collection['fields']['required']
            else:
                mapping = self.collection['fields']['optional']
            dd = defaultdict(list)
            for mol, source in mapping.iteritems():
                dd[source].append(mol)
            return dd
            #return dict((source, mol) for mol,source in mapping.iteritems())

        def getdir(self):
            return self.collection['collection']

        def get(self, key, default=None):
            return self.collection.get(key, default)

        def validate(self):
            """Validates the current "Collections" configuration.

            It does this by by checking field names against those specified
            in http://www.google.com/fusiontables/DataSource?dsrcid=1348212,
            our current configuration source.

            Arguments:
                none.

            Returns:
                nothing.

            No arguments are required. If validation fails, this method will
            exit with an error message.
            """

            ERR_VALIDATION = 3 # Conventionally, 0 = success, 1 = error, 2 = command line incorrect.
            """ Fatal errors because of validation failures will cause an exit(ERR_VALIDATION) """

            config_section_to_validate = "'%s', directory '%s'" % (self.filename, self.getdir())

            # Step 1. Check if both required categories are present.
            if not self.collection.has_key('fields') or not self.collection['fields'].has_key('required'):
                logging.error("Required section 'Collections:Fields:Required' is not present in '%s'!" +
                    "Validation failed.", config_section_to_validate)
                exit(ERR_VALIDATION)

            # Step 2. Validate fields.
            fusiontable_id = 1348212
            ft_partial_url = "http://www.google.com/fusiontables/api/query?sql="

            def validate_fields(fields, section, where_clause, required = 1):
                """ Ensures that the keys of the dictionary provided precisely match the list of field
                names retrieved from the Fusion Table.

                You provide the 'WHERE' clause of the SQL query you need to execute to get the list of
                valid fields (probably something like "required = 'y'").

                Arguments:
                    fields: The dictionary whose keys we have to validate.
                    where_clause: The SQL query we will run against the Fusion Table to retrieve the
                        list of valid field names.
                    required: If set to '1' (the default), we identify these as required fields, and
                        ensure that *all* the field names retrieved by the query are present in the
                        'fields' dictionary. If set to '0', we only check that all field names present
                        in the fields dictionary are also set in the database results.
                Returns:
                    1 if there were any validation errors, 0 if there were none.
                """

                # Let's make sure that the 'fields' argument is set.
                if fields is None:
                    if required == 1:
                        logging.error("Required section '%s' not present in %s.", section, config_section_to_validate)
                        exit(ERR_VALIDATION)
                    else:
                        logging.warning("Optional section '%s' not present in %s, ignoring.", section, config_section_to_validate)
                        return 0

                # Try retrieving the expected fields from the Fusion Table.
                expected_fields = set()
                errors = 0

                sql = "SELECT alias, required, source FROM %d WHERE %s AND alias NOT EQUAL TO ''" % (fusiontable_id, where_clause)

                try:
                    urlconn = urllib.urlopen(
                        ft_partial_url + urllib.quote_plus(sql)
                    )
                except IOError as (errno, strerror):
                    logging.warning("Could not connect to the internet to validate %s: %s", config_section_to_validate, strerror)
                    logging.warning("Continuing without validation.")
                    return 0

                # Read the field names into a dictionary.
                rows = csv.DictReader(urlconn)

                for row in rows:
                    if not row.has_key('alias'):
                        logging.error(
                            """The following Google Fusion Table SQL
query failed to return any results; this should never happen:\n\t%s""", sql)
                        exit(1)

                    # We don't need to test for row['alias'], because our SQL statement already removes any blank aliases.
                    if (row['alias'].lower()) in expected_fields:
                        logging.error("Field alias '%s' is used twice in the Fusion Table, aborting.",
                            row['alias'].lower()
                        )
                        exit(1)

                    # Add this field name to the list of expected fields.
                    expected_fields.add(row['alias'].lower())

                urlconn.close()

                # Check if there are differences either ways for required sections, or for fields
                # present in 'fields' but not in 'expected_fields' for optional sections.
                errors = 0
                field_aliases = set(fields.keys())
                if len(field_aliases.difference(expected_fields)) > 0:
                    logging.error("  Unexpected fields found in section '%s': %s", section, ", ".join(
                        sorted(field_aliases.difference(expected_fields)))
                    )
                    errors = 1

                if len(expected_fields.difference(field_aliases)) > 0:
                    if required == 1:
                        logging.error("  Fields missing from section '%s': %s", section, ", ".join(
                            sorted(expected_fields.difference(field_aliases)))
                        )
                        errors = 1
                    else:
                        # If these fields aren't required, let's just add the fields into the dict
                        # ourselves. Otherwise, downstream programs expecting these fields (such as
                        # bulkload_helper.py) mess up.
                        for fieldname in (expected_fields.difference(field_aliases)):
                            fields[fieldname] = ''

                # Returns 1 if there were any errors, 0 for no errors.
                return errors

            # We want to give an error if *any* of these tests fail.
            errors = 0

            errors += validate_fields(
                self.collection['fields']['required'],
                "Collections:Fields:Required",
                "required = 'y'",
                1)

            errors += validate_fields(
                self.collection['fields']['optional'],
                "Collections:Fields:Optional",
                "required = ''",
                0)

            # In case of any errors, bail out.
            if errors > 0:
                logging.error("%s could not be validated. Please fix the errors reported above and retry. " +
                    "You can also use the '-V' command line argument to temporarily turn off validation, " +
                    "if you only need to test other program functionality.", config_section_to_validate)
                exit(ERR_VALIDATION)

            # No errors? Return successfully!
            return

    def __init__(self, filename):
        self.filename = filename
        self.config = Config.lower_keys(yaml.load(open(filename, 'r').read()))

    def collection_names(self):
        return [x.get('collection') for x in self.collections()]

    def collections(self):
        return [Config.Collection(self.filename, collection, self.config['source']['name']) for collection in self.config['collections']]

def source2csv(source_dir, options):
    ''' Loads the collections in the given source directory.

        Arguments:
            source_dir - the relative path to the directory in which the config.yaml file is located.
    '''
    config = Config(os.path.join(source_dir, 'config.yaml'))
    logging.info('Collections in %s: %s' % (source_dir, config.collection_names()))

    for collection in config.collections(): # For each collection dir in the source dir
        coll_dir = collection.getdir()

        original_dir = os.getcwd() # We'll need this to restore us to this dir at the end of processing this collection.
        os.chdir(os.path.join(source_dir, coll_dir))

        # Create collection.csv writer
        coll_file = open('collection.csv.txt', 'w')
        coll_cols = collection.get_columns()
        coll_cols.append('the_geom_webmercator')
        coll_cols.sort()
        coll_csv = UnicodeDictWriter(coll_file, coll_cols)
        # coll_csv = csv.DictWriter(coll_file, coll_cols)
        coll_csv.writer.writerow(coll_csv.fieldnames)
        coll_row = collection.get_row()
        coll_row['layer_source'] = source_dir
        coll_row['layer_collection'] = coll_dir

        # Create polygons.csv writer
        poly_file = open('collection.polygons.csv.txt', 'w')
        poly_dw = UnicodeDictWriter(poly_file, ['shapefilename', 'json'])
        # poly_dw = csv.DictWriter(poly_file, ['shapefilename', 'json'])
        poly_dw.writer.writerow(poly_dw.fieldnames)

        glob.glob('*.shp')
        # Convert DBF to CSV and add to collection.csv
        shpfiles = glob.glob('*.shp')
        logging.info('Processing %d layers in the %s/%s' % (len(shpfiles), source_dir, coll_dir))
        for sf in shpfiles:
            logging.info('Extracting DBF fields from %s' % sf)
            csvfile = '%s.csv' % sf
            if os.path.exists(csvfile): # ogr2ogr barfs if there are *any* csv files in the dir
                os.remove(csvfile)

            # For Macs which have GDAL.framework, we can autodetect it
            # and use it automatically.
            ogr2ogr_path = '/Library/Frameworks/GDAL.framework/Programs/ogr2ogr'
            if not os.path.exists(ogr2ogr_path):
                # We don't have a path to use; let subprocess.call
                # find it.
                ogr2ogr_path = 'ogr2ogr'

            # TODO: optional command line option for ogr2ogr command

            command = ogr2ogr_path + ' -f CSV "%s" "%s"' % (csvfile, sf)
            args = shlex.split(command)
            try:
                subprocess.call(args)
            except OSError as errmsg:
                logging.error("""Error occurred while executing command line '%s': %s
    Please ensure that %s is executable and available on your path.
                """, command, args[0], errmsg)
                raise # Re-raise the OSError exception.

            # Copy and update coll_row with DBF fields
            row = copy.copy(coll_row)
            row['layer_filename'] = os.path.splitext(sf)[0]
            dr = csv.DictReader(open(csvfile, 'r'), skipinitialspace=True)

            # Lowercase all field names.
            dr.fieldnames = map(lambda fn: fn.lower(), dr.fieldnames)

            layer_polygons = []
            
            
            # ------------------------------------------------------- 

            # Rename .dbf file temporarily
            name = os.path.splitext(sf)[0]
            dbf_filename = '%s.dbf' % name
            dbf_filename_temp = '%s~' % dbf_filename
            logging.info('DBF %s' % dbf_filename)
            os.rename(dbf_filename, dbf_filename_temp)

            # Create the .dbf blank (it has no fields)
            w = shapefile.Writer(shapefile.POLYGONM)
            w.poly(parts=[[[1,5],[5,5],[5,1],[3,3],[1,1]]])
            w.save(dbf_filename)

            # Get the projection SRID (default 3857)
            proj = open('%s.prj' % name, 'r').read()
            srs = osr.SpatialReference()
            srs.ImportFromESRI([proj])
            srs.AutoIdentifyEPSG()
            srid = srs.GetAuthorityCode(None)
            if srid == None:
                srid = 3857

            # Create SQL file that contains the_geom
            sql_file = open('%s.sql' % name, 'wr+')
            command =  'shp2pgsql -I -D -d -s %s %s polygons > %s.sql' % (srid, name, name)
            logging.info('Converting shapefile: %s' % command)
            args = shlex.split(command)
            subprocess.call(args, stdout=sql_file)

            # Parse SQL file for a list of the_geom data
            sql_file.seek(0)
            the_geom = sql_file.read().split('\n')[8:-4]
            logging.info('Parsed %s polygons from the_geom' % len(the_geom))

            # Restore .dbf file name
            os.rename(dbf_filename_temp, dbf_filename)

            # ------------------------------------------------------- 

            row_count = 0
            for dbf in dr: # For each row in the DBF CSV file (1 row per polygon)

                row['the_geom_webmercator'] = the_geom[row_count]
                row_count += 1

                polygon = {}

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

                # Write coll_row to collection.csv

                # 1) Rename x.dbf to x.dbf_
                # 2) Create blank x.dbf
                # 3) Run: shp2pgsql -I -d -s 3857 x test > x.sql
                # 4) Get list of the_geom 
                # 5) For each the_geom: row['the_geom_webmercator'
                
                coll_csv.writerow(row)
                layer_polygons.append(polygon)

            # Create JSON representation of dbfjson
            polygons_json = simplejson.dumps(layer_polygons) # TODO: Showing up as string instead of JSON in API
            d=dict(shapefilename=row['layer_filename'], json=polygons_json)
            poly_dw.writerow(dict(shapefilename=row['layer_filename'], json=polygons_json))
        poly_file.flush()
        poly_file.close()

        # Important: Close the DictWriter file before trying to bulkload it
        logging.info('All collection metadata saved to %s' % coll_file.name)
        logging.info('All collection polygons saved to %s' % poly_file.name)
        coll_file.flush()
        coll_file.close()

        # Bulkload...

        # os.chdir(current_dir)
        if not options.dry_run:
            os.chdir('../../')
            filename = os.path.abspath('%s/%s/collection.csv.txt'
                % (source_dir, coll_dir))

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

            # print "Columns: " + collection.get_metadata_columns().__repr__()
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
            #cur.execute("DELETE FROM layers WHERE provider=%s AND collection=%s", [source_dir.lower(), coll_dir.lower()])

            # Add the new rows to the database.
            sql = "COPY layers (" + \
                    ', '.join(collection.get_metadata_columns() + ['the_geom_webmercator']) + \
                ") FROM STDIN WITH NULL AS '' CSV"
            logging.info('SQL %s' % sql)

            cur.copy_expert(
                "COPY layers (" +
                    ', '.join(collection.get_metadata_columns() + ['the_geom_webmercator']) +
                ") FROM STDIN WITH NULL AS '' CSV", stringio)

            stringio.close()

            

            

            # Now, we need to create a CSV to bulkload to Google.
            # TODO: At the moment, we reupload the *entire* database to
            # Google App Engine. This is going to get unwieldy fast.
            # Instead, we ought to only bulkupload rows in *this*
            # provider and collection combination. Unfortunately,
            # there is no easy way to do this: we have to create
            # a temporary table in PostgreSQL.
            filename = os.path.abspath('%s/%s/collection.for-google.csv.txt'
                % (source_dir, coll_dir))

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

def _getoptions():
    ''' Parses command line options and returns them.'''
    parser = OptionParser()
    parser.add_option('--config_file',
                      type='string',
                      dest='config_file',
                      metavar='FILE',
                      help='Bulkload YAML config file.')
    parser.add_option('-d', '--dry_run',
                      action="store_true",
                      dest='dry_run',
                      help='Creates CSV file but does not bulkload it')
    parser.add_option('-l', '--localhost',
                      action="store_true",
                      dest='localhost',
                      help='Shortcut for bulkloading to http://localhost:8080/_ah/remote_api')
    parser.add_option('-s', '--source_dir',
                      type='string',
                      dest='source_dir',
                      help='Directory containing source to load.')

    parser.add_option('--url',
                      type='string',
                      dest='url',
                      help='URL endpoint to /remote_api to bulkload to.')
    parser.add_option('--no-validate', '-V',
                      action="store_true",
                      dest="no_validate",
                      help="Turns off validation of the config.yaml files being processed."
    )

    return parser.parse_args()[0]

def main():
    logging.basicConfig(level=logging.DEBUG)
    options = _getoptions()
    current_dir = os.path.curdir
    if options.dry_run:
        logging.info('Performing a dry run...')

    if options.source_dir is not None:
        if os.path.isdir(options.source_dir):
            logging.info('Processing source directory: %s' % options.source_dir)
            source2csv(options.source_dir, options)
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
            source2csv(sd, options)

    logging.info('Loading finished!')

if __name__ == '__main__':
    main()
