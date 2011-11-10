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
prints out a PostgreSQL CREATE TABLE instruction which will create 
a table for storing the fields specified in it.
"""

import csv
import simplejson
import urllib
import logging
from optparse import OptionParser

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

    def get_pg_table(self):
        """ Returns a string representation of this table schema as a CREATE TABLE command
        for PostgreSQL."""

        create_template = """
-- DROPs the layers table. WARNING: This will
-- PERMANENTLY DELETE DATA! Please DO NOT RUN
-- this script if you want to keep your existing
-- data!
SET CLIENT_ENCODING TO UTF8;
SELECT DropGeometryColumn('','layers','the_geom_webmercator');
DROP TABLE IF EXISTS layers;

-- Creates the layers table.
CREATE TABLE layers (
    id SERIAL PRIMARY KEY,
    temp_geom TEXT,
    %s
);

SELECT AddGeometryColumn('','layers','the_geom_webmercator','4326','MULTIPOLYGON',3);
CREATE INDEX "layers_the_geom_webmercator_gist" ON "layers" using gist ("the_geom_webmercator" gist_geometry_ops);
  
/* Replace 'mol_service' with the username MoL will use to access 
   this database. */
GRANT SELECT, INSERT, UPDATE, DELETE ON layers TO mol_service;
GRANT SELECT, USAGE, UPDATE ON layers_id_seq TO mol_service;

-- TODO: GRANT permissions to spatial_ref_sys as well.
"""

        columns = []
        for field in self.schema.keys():
            column_schema = self.schema[field]

	    columns.append("%s %s %s" % (
		field,
                column_schema['type'] if column_schema['type'] else "TEXT",
		"NOT NULL" if column_schema['required'] else "NULL"
	    ))

	return create_template % (",\n    ".join(columns))

    def __repr__(self):
        """ Returns a string representation of this object. """
        return ("Fields: %s\n\nIndexed fields: %s" %
            (self.schema.__repr__(), ', '.join(self.indexed_fields)))
                
def _getoptions():
    ''' Parses command line options and returns them.'''
    parser = OptionParser()
    #parser.add_option('--no-validate', '-V',
    #                  action="store_true",
    #                  dest="no_validate",
    #                  help="Turns off validation of the config.yaml files being processed."
    #)

    return parser.parse_args()[0]

def main():
    logging.basicConfig(level=logging.DEBUG)
    options = _getoptions()    

    schema = TableSchema()
    schema.load_from_ft()
    print schema.get_pg_table()

if __name__ == '__main__':
    main()
