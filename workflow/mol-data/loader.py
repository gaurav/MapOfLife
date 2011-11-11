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

                    # Convert field names to dbfnames.
                    dbf_properties = {}
                    for fieldname in new_properties.keys():
                        dbf_properties[ProviderConfig.fieldname_to_dbfname(fieldname)] = new_properties[fieldname]

               
                    # Replace the existing properties with the new one.
                    feature['properties'] = dbf_properties
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
