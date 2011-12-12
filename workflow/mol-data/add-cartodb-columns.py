#!/usr/bin/env python
#
# Copyright 2011 Gaurav Vaidya
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

"""This script downloads the field information Fusion Table, and 
prints out PostgreSQL ALTER TABLE instructions which will create 
a table for storing the fields specified in it.

AN IMPORTANT CAVEAT: If the field spec defines a field which
overlaps with an existing CartoDB field, you are responsible
for deleting that field before running this script. Currently,
as of Dec 2011, the only field which conflicts in this way
is the 'description' field.
"""

import codecs
import csv
import logging
import simplejson
import urllib
from optparse import OptionParser

from cartodb import CartoDB

class TableSchema(object):
    """Represents the table schema."""

    def __init__(self):
        """Creates a table schema object."""

        self.schema = {}
        self.indexed_fields = []

    def load_from_ft(self):
        """ Loads the format from our Fusion Table at 
        http://www.google.com/fusiontables/DataSource?dsrcid=1348212
        and sets up the schema in this object.
        """
        
        fusiontable_id = 1348212
        ft_partial_url = "http://www.google.com/fusiontables/api/query?sql="
            
        try:
            urlconn = urllib.urlopen(
                ft_partial_url + 
                urllib.quote_plus(
                    "SELECT alias, required, indexed, type, source FROM %d WHERE alias NOT EQUAL TO ''" 
                        % (fusiontable_id)
                )
            )
        except IOError as (errno, strerror):
            logging.error("Could not connect to the internet to load Fusion Table %s: %s", 
                fusiontable_id, strerror)
            exit(1)

        # Read the field names into a dictionary.
        rows = csv.DictReader(urlconn)
        for row in rows:
            # We don't need to test for row['alias'], because our SQL statement already 
            # removes any blank aliases.
            row_alias = row['alias']

            if row_alias in self.schema:
                logging.error("Field alias '%s' is used twice in the Fusion Table, aborting.", 
                    row_alias
                )
                exit(1)

            # Add this field name to the list of fields we must include in our schema.
            is_required = 1
            if row['required'] is None or row['required'] != 'y':
                is_required = 0

            self.schema[row_alias] = {'required': is_required, 'type': row['type']}

            # Check if this field should be indexed.
            if row['indexed'] is not None and row['indexed'] == 'y':
                self.schema[row_alias]['indexed'] = 1
                self.indexed_fields.append(row_alias)
            else:
                self.schema[row_alias]['indexed'] = 0

        urlconn.close()

    def setup_cartodb_table(self, table_name):
        """ Set up the schema we need on CartoDB table 'table_name' """

        print "Logging in to CartoDB using the settings in 'cartodb.json'."
        try:
            cartodb_settings = simplejson.loads(
                codecs.open('cartodb.json', encoding='utf-8').read(), 
                encoding='utf-8')
        except Exception as ex:
            logging.error("Could not load CartoDB setting file 'cartodb.json': %s" % ex)
            exit(1)

        print "Updating table %s." % table_name
        cdb = CartoDB(
            cartodb_settings['CONSUMER_KEY'],
            cartodb_settings['CONSUMER_SECRET'],
            cartodb_settings['user'],
            cartodb_settings['password'],
            cartodb_settings['domain']
        )

        for field in self.schema.keys():
            column_schema = self.schema[field]

	    response = cdb.sql("ALTER TABLE %s ADD COLUMN %s %s %s" % (
                table_name,
		field,
                column_schema['type'] if column_schema['type'] else "TEXT",
		"NOT NULL" if column_schema['required'] else "NULL"
	    ))
            print "\tField '%s' created." % field
            print "\tResponse: " + response.__str__()

	return

    def __repr__(self):
        """ Returns a string representation of this object. """
        return ("Fields: %s\n\nIndexed fields: %s" %
            (self.schema.__repr__(), ', '.join(self.indexed_fields)))
                
def _getoptions():
    ''' Parses command line options and returns them.'''
    parser = OptionParser()
    parser.add_option("-t", "--table",
        action="store",
        dest="tablename",
        default="temp_geodb",
        help="The name of the table to add the required columns to (default: 'temp_geodb')."
    )

    return parser.parse_args()[0]

def main():
    logging.basicConfig(level=logging.DEBUG)
    options = _getoptions()    

    schema = TableSchema()
    schema.load_from_ft()
    schema.setup_cartodb_table(options.tablename)
    print "Exiting."

if __name__ == '__main__':
    main()
