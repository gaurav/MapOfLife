A plan for validating taxon names.

TNRS = Taxonomic Name Resolution Service.

This folder will contain code to update and maintain TNRS databases. The plan is 
to set up the simplest table that we can use to figure out the validity of names.

1. sql/ -- contains the SQL code describing the table. It's just easier for us if we
set up all the constraints in PostgreSQL, so that the server can maintain data coherence.

A proposed schema for the names table (names.sql):

    id                  (primary key serial)
    is_deleted          (boolean NOT NULL DEFAULT FALSE) If a record needs to be deleted, this
                        field can be set so that it is ignored by stored procedures.
    name                (text indexed) The scientific name as a canonical name (no authority!)
    authority           (text) Authority for this scientific name, if available.
    accepted_name       (text indexed) The accepted name as a canonical name (no authority!)
    accepted_authority  (text) Authority for this scientific name, if available.
    url                 (text) A dereferenceable URL for this name.
    status              (text procedure) The status of this name. At the moment, we have two possible
                        statuses:
                            ambiguous: There is more than one accepted name for this scientific name.
                            unique: There is exactly one accepted name for this scientific name.
                        This "field" should probably be a STABLE procedure.
    source              (text NOT NULL) The TNRS/checklist being used, e.g. "ITIS"
    version             (text NOT NULL) The version of the TNRS/checklist being used.
    notes               (text) Used to store information about the generation of this record.
                        In particular, if we use biodiversity.rb to parse the names, the original
                        name will be recorded here.
    family		(text) Family name.

One possible optimizatoin would be to have all fields should be stored lowercase so 
that case doesn't affect searches. However, at the moment, the code compares names
against those in the database, which are stored in normal case ("Panthera tigris", etc).
So maybe later?

2. TNRS/taxonomic checklists will be incorporated into this database using the following algorithm:

    1. For every TNRS,
        1. Determine the TNRS name (probably through user input) -> source.
        2. Determine the version number of the TNRS (probably through user input) -> version.
        3. For every name in the TNRS -> name:
            1. Create a new record with names.name = name
            2. Set authority if available in the TNRS. For TNRSes without authority information,
                we can use GNA's biodiversity.rb code to parse it out from the rest of the name.
            3. While the accepted name has no accepted name (apart from itself):
                1. Recurse to that name and check whether it has an accepted name.
            4. Add accepted name and authority. Again, parse this with biodiversity.rb if necessary,
                in which case record this in the notes.
            5. Record this name in the database.

3. Validate existing and new names. This will be carried out with the following algorithm:

    1. For every name, 
        1. search for a corresponding name_string in the names table.
        2. If there is a perfect match, do nothing.
        3. If there is no perfect match, generate an error message.

4. When a new database needs to be incorporated into Map of Life, we use the following algorithm:

    (Note that although this algorithm suggests replacing record on the live database, this might
     be easier by copying records into a new table, then DELETE-ing existing records, then INSERT-ing
     the new records back into the live table).

    1. Ask the user for the name of the TNRS -> source.
    2. Provide the list of possible versions for that source (there should only be one);
       let the user pick one -> version.
    3. For every name in the new TNRS dataset:
        1. Check if that name exists in the database for the given source and version.
        2. If it does:
            1. Check if any of the fields have changed.
            2. If they have not:
                1. Update the version number to the latest version.
                2. Commit changes.
            3. If they have:
                1. Update the records.
                2. Note changes in the notes field.
                3. Commit changes.
        3. If it does not:
            1. Add the name to the database (see algorithm for step #2).
            2. Commit changes.
    4. Check if any names are left on the old version (suggesting that they have been removed
       from the database). Add a note in their "notes" field 

5. Splits and lumps

    In this simplified model, splits and lumps can be determined by checking for "ambiguous" names.

    Remember, what's importance for us is the distinction between the following statements:
        "the species concept denoted by name X is clear" (all names have the same accepted name)
        "the species concept denoted by name X partially covers that denoted by name Y"

    There are four types of name, based on SN (scientific name) and AN (accepted name):
        1.  Both SN and AN are linked to different names.
            - e.g. 
                "Gorilla gorilla"   -> "Gorilla berengei"
                "Gorilla gorilla"   -> "Gorilla gorilla"
                "Gorilla gina"      -> "Gorilla gorilla"

            - In this case, Gorilla gorilla s.l. consists of G. gorilla and G. berengei,
              but NOT Gorilla gina.

        2.  SN is (separately) associated with more than one accepted name.
            - The "Gorilla gorilla" problem

        3.  AN is (separately) associated with more than one scientific name.
            - The "Felis tigris" problem

        4.  Neither SN nor AN is associated with other names.
            - No taxonomic issues.

    This maps to iNaturalist's taxon changes as follows:
        "split": one name replaced by one or more other names.
            e.g.    "Gorilla gorilla" -> "Gorilla beringei"
        "merge": one or more names replaced by one name.
            - homotypic synonym
            - 
        "swap": one name replaced by another without any change in taxon concept.
            - moved to another genus
            - homotypic synonym
            e.g.    "Felis tigris" -> "Panthera tigris"
        "stage": A completely new name is added.
            e.g.    "Nyctibatrachus vrijeuni Biju, 2011"
        "drop": A name is completely removed; iNat appears to
            use this for duplicates and nomina dubia.
            e.g.    "Boophis angrangoloaka"
