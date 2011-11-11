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

"""This code manages operations on the provider configuration file.

We use config.yaml to inform us about the mapping between DBF field 
names and the field names we have defined in our data specification. 
This code will be responsible for reading, parsing and validating 
'config.yaml', and for providing the column mappings in a format that 
other programs can understand.

This code might possibly eventually need to move to the Collection
level (i.e. one config.yaml file per collection), so that is something
we should keep an eye on.
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

class ProviderConfig(object):
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
        """Wraps a single collection defined in a 'config.yaml' file."""

        def __init__(self, filename, collection, provider):
            """Creates a collection, given the name of the collection and the data provider."""

            self.filename = filename
            self.collection = collection

            # Set up collection field data structures.
            fields = self.collection['fields']
            if 'required' in fields:
                fields['required']['provider'] = provider.lower()
                fields['required']['collection'] = self.collection['collection'].lower()

            # NOTE: No longer being autovalidated! Please call ProviderConfig.validate()
            # to validate.

        def __repr__(self):
            return str(self.__dict__)

        def get_defined_fields(self):
            """Returns columns storing metadata (which is all of them except the generated ones)."""
            cols = []
            cols.extend(self.collection['fields']['required'].keys())
            cols.extend(self.collection['fields']['optional'].keys())
            return cols

        def get_mapping(self, required=True):
            """Returns a reverse fields for convenience."""

            if required:
                mapping = self.collection['fields']['required']
            else:
                mapping = self.collection['fields']['optional']
            dd = dict()
            for mol, source in mapping.iteritems():
                if source is not None and source != '' and unicode(source)[0] == '=':
                    dd[unicode(source).lower()] = mol
                    # TODO: Restore multiple mappings, as below:
                    # dd[unicode(source).lower()].append(mol)
            return dd

            #return dict((source, mol) for mol,source in mapping.iteritems())

        def default_fields(self):
            """ Returns a dict of every field which already has a value set in config.yaml """

            dict = {}

            for (name, value) in self.collection['fields']['required'].iteritems():
                if value is not None and value != '' and unicode(value)[0] != '=':
                    dict[name] = value
            
            for (name, value) in self.collection['fields']['optional'].iteritems():
                if value is not None and value != '' and unicode(value)[0] != '=':
                    dict[name] = value

            return dict

        def map_field(self, row_no, name, specified_value):
            # Is this a mapped field?
            mapping = self.get_mapping()

            name_lc = unicode(name).lower()

            if ('=' + name_lc) in mapping:
                field_to_map_to = mapping['=' + name_lc] 

                # Quick check for 'blank' mappings.
                # TODO: Reactivate this at some point.
                # if self.is_required(field_to_map_to) and (specified_value is None or specified_value == ''):
                #    logging.error("Required field '%s' is mapped from DBF column '%s', but row %d is missing a value in this dataset." % (field_to_map_to, name_lc, row_no))
                #    exit()
                
                # Otherwise, go right ahead and map it!
                return (field_to_map_to, specified_value)

            # No mapping? Okay then.
            return (None, None)
            
        def is_required(self, fieldname):
            """ Returns true if a particular field is required, false if optional. """
            if fieldname in self.collection['fields']['required'].keys():
                return True
            elif fieldname in self.collection['fields']['optional'].keys():
                return False
            else:
                logging.error("is_required('%s') called on a fieldname not in the spec" % fieldname)
                exit(1)

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

            config_section_to_validate = "'%s', collection '%s'" % (self.filename, self.getdir())

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
                    logging.error("Unexpected fields found in section '%s': %s", section, ", ".join(
                        sorted(field_aliases.difference(expected_fields)))
                    )
                    errors = 1

                if len(expected_fields.difference(field_aliases)) > 0:
                    if required == 1:
                        logging.error("Fields missing from section '%s': %s", section, ", ".join(
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

    def __init__(self, filename, provider):
        self.filename = filename
        self.provider = provider
        self.config = ProviderConfig.lower_keys(yaml.load(open(filename, 'r').read()))

    # Deprecated; if nothing breaks, delete it.
    # def collection_names(self):
    #    return [x.get('collection') for x in self.collections()]

    def collections(self):
        return [ProviderConfig.Collection(self.filename, collection, self.provider) for collection in self.config['collections']]

    def validate(self):
        for collection in self.collections():
            collection.validate()

    # A private class variable so we don't have to keep going
    # back to the Fusion Table.
    __dbfname_lookup = None

    @staticmethod
    def fieldname_to_dbfname(fieldname):
        """ Given a fieldname, it looks up the corresponding dbfname """
        
        if ProviderConfig.__dbfname_lookup is None:
            ProviderConfig.__dbfname_lookup = \
                ProviderConfig.get_fieldname_to_dbfname_dict()

        # print "val: " + ProviderConfig.__dbfname_lookup.__repr__();

        return ProviderConfig.__dbfname_lookup[fieldname]

    @staticmethod
    def get_fieldname_to_dbfname_dict():
        """ Returns the map of fieldnames to dbfnames. """

        # Check the fusiontable for the conversion. 
        fusiontable_id = 1999452
        ft_partial_url = "http://www.google.com/fusiontables/api/query?sql="

        sql = "SELECT FieldName, dbfname FROM %d WHERE FieldName NOT EQUAL TO ''" % fusiontable_id

        try:
            urlconn = urllib.urlopen(
                ft_partial_url + urllib.quote_plus(sql)
            )
        except IOError as (errno, strerror):
            logging.error("Could not connect to the internet to determine the dbfname dict: %s" % strerror)
            exit(1) 
            
        # Read the field names into a dictionary.
        rows = csv.DictReader(urlconn)

        results = dict()
        for row in rows:
             results[row['FieldName'].lower()] = row['dbfname'].lower()

        urlconn.close()

        return results




def _getoptions():
    ''' Parses command line options and returns them.'''
    parser = OptionParser()
    parser.add_option('-s', '--source_dir',
                      type='string',
                      dest='source_dir',
                      help='Directory containing source to load.')

    return parser.parse_args()[0]

def validate_dir(dir):
    """Validates the config.yaml file in a particular directory. """

    if not os.path.exists(dir + "/config.yaml"):
        logging.error("No 'config.yaml' file found in directory " + dir)

    logging.info("Validating " + dir + "/config.yaml.")
    config = ProviderConfig(dir + "/config.yaml", os.path.basename(dir))
    config.validate()
    logging.info("Validation successful.")

def main():
    logging.basicConfig(level=logging.DEBUG)
    options = _getoptions()
    current_dir = os.path.curdir

    if options.source_dir is not None:
        if os.path.isdir(options.source_dir):
            logging.info('Processing source directory: %s' % options.source_dir)
            validate_dir(options.source_dir)
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
                validate_dir(sd)

    logging.info('All directories processed.')

if __name__ == '__main__':
    main()
