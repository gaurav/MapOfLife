"""This module surfaces an autocomplete API for scientificname. 

Example usage:

  http://localhost:8080/api/autocomplete?key=Abr

  [
    "Abrawayaomys ruschii",
    "Abrocoma bennettii",
    "Abrocoma boliviensis",
    "Abrocoma cinerea",
    "Abrothrix andinus",
    "Abrothrix jelskii"
  ]
"""
from google.appengine.ext import webapp
from google.appengine.ext.ndb import model
from google.appengine.ext.webapp.util import run_wsgi_app

import logging
import simplejson

class AutocompleteName(model.Model):
    """Model for autocompleted names. Each entity key is a substring of a 
    scientificname with a list of matching names. 
    """
    names = model.StringProperty('n', repeated=True)
    names_json = model.ComputedProperty(lambda self: simplejson.dumps(self.names))
    created = model.DateTimeProperty('c', auto_now_add=True)
    @classmethod
    def get(cls, key):
        return model.Key(cls.__name__, key.strip().lower()).get()

    @classmethod
    def create(cls, key):
        return cls(id=key.strip().lower())

class AutocompleteHandler(webapp.RequestHandler):
    """Handler for the autocomplete request. Expects a key parameter. Returns 
    a list of all matching names or an empty list as JSON.
    """
    def get(self):
        self.response.headers["Content-Type"] = "application/json"
        key = self.request.get('key', None)
        if not key:
            self.response.out.write('[]')
            return
        entity = AutocompleteName.get(key)
        if not entity:
            self.response.out.write('[]')
        else:
            self.response.out.write(entity.names_json)

application = webapp.WSGIApplication(
         [('/api/autocomplete', AutocompleteHandler)],
         debug=True)

def main():
    run_wsgi_app(application)

if __name__ == "__main__":
    main()
