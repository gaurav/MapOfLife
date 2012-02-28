#!/usr/bin/env python
#
# Copyright 2012 Gaurav Vaidya
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

"""
This script will download an aggregated list of possible
values in a particular field on a CartoDB table. It will
optionally output the results as a CSV file.
"""

import codecs
import csv
import logging
import os
import simplejson
import urllib
from optparse import OptionParser

from cartodb import CartoDB

def _getoptions():
    ''' Parses command line options and returns them.'''
    parser = OptionParser()
    parser.add_option("-t", "--table",
        action="store",
        dest="tablename",
        default="polygons",
        help="The name of the table to add the required columns to (default: 'polygons')."
    )
    parser.add_option("-f", "--field",
        action="store",
        dest="fieldname",
        default="scientificName",
        help="The name of the field to aggregate (default: 'scientificName')"
    )
    parser.add_option("-c", "--cartodb-config",
        action="store",
        dest="config_file",
        default="cartodb.json",
        help="The cartodb.json file to process (default: 'cartodb.json')"
    )

    return parser.parse_args()[0]

def main():
    logging.basicConfig(level=logging.DEBUG)
    options = _getoptions()    

    config_file = options.config_file
    if config_file == 'cartodb.json':
        config_path = os.path.join('..', config_file)
        if not os.path.exists(config_file) and os.path.exists(config_path):
            config_file = config_path

    logging.info("Logging in to CartoDB using the settings in '%s'." % config_file)
    try:
        cartodb_settings = simplejson.loads(
            codecs.open(config_file, encoding='utf-8').read(), 
            encoding='utf-8')
    except Exception as ex:
        logging.error("Could not load CartoDB setting file '%s': %s", config_file, ex)
        exit(1)

    logging.info("Connecting to CartoDB.")
    cdb = CartoDB(
        cartodb_settings['CONSUMER_KEY'],
        cartodb_settings['CONSUMER_SECRET'],
        cartodb_settings['user'],
        cartodb_settings['password'],
        cartodb_settings['user'],
        host=cartodb_settings['domain'],
        protocol=cartodb_settings['protocol'],
        access_token_url=cartodb_settings['access_token_url']
    )

    logging.info("Downloading aggregate data on field '%s' in table '%s'.",
        options.fieldname, options.tablename)
    results = cdb.sql("SET STATEMENT_TIMEOUT TO 0; SELECT %(fieldname)s FROM %(tablename)s" %
        {'fieldname': options.fieldname, 
         'tablename': options.tablename}
    )

    fieldname_lc = options.fieldname.lower()
    rows = results['rows']
    print options.fieldname
    
    total_count = 0
    for row in rows:
        print "\"" + row[fieldname_lc] + "\""

    logging.info("Download complete, %d rows written out.", len(rows))

if __name__ == '__main__':
    main()
