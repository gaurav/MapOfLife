__author__ = "Aaron Steele (eightysteele@gmail.com)"
__contributors__ = []

import cache

import logging
import simplejson
import urllib

from google.appengine.api import urlfetch
from google.appengine.ext import ndb 
from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app

global entities
entities = []

def check_entities(flush=False):
    """Writes entities to datastore in batches."""
    global entities
    if len(entities) > 100 or flush:
        ndb.put_multi(entities)
        entities = []        
    
def handle_result(rpc, name, url, payload):
    """Builds up a list of CacheEntry entities and batch puts them."""   
    key = 'name-%s' % name
    try:
        result = rpc.get_result()
        entities.append(cache.create_entry(key, result.content))
        check_entities()
    except urlfetch.DownloadError:
        tries = 10
        while tries > 0:
            result = urlfetch.fetch(url, payload=payload, method='POST', deadline=60)
            try:
                entities.append(cache.create_entry(key, result.content))
                check_entities()
                return
            except urlfetch.DownloadError:
                tries = tries - 1

def create_callback(rpc, name, url, payload):
    """Callback for a request."""
    return lambda: handle_result(rpc, name, url, payload)

class SearchCacheBuilder(webapp.RequestHandler):
    def get(self):
        self.error(405)
        self.response.headers['Allow'] = 'POST'
        return

    def post(self):
        url = 'https://mol.cartodb.com/api/v2/sql'
        sql = 'SET STATEMENT_TIMEOUT TO 0; select distinct(scientificname) from polygons UNION select distinct(scientificname) from points'
        request = '%s?%s' % (url, urllib.urlencode(dict(q=sql)))
        result = urlfetch.fetch(request, deadline=60)
        content = result.content
        rows = simplejson.loads(content)['rows']

        sql = "SET STATEMENT_TIMEOUT TO 0; SELECT p.provider as source, p.scientificname as name, p.type as type FROM polygons as p WHERE p.scientificname = '%s' UNION SELECT t.provider as source, t.scientificname as name, t.type as type FROM points as t WHERE t.scientificname = '%s'"
     
        for names in self.names_generator(rows):   
            rpcs = []
            for name in names:
                q = sql % (name, name)
                payload = urllib.urlencode(dict(q=q))
                rpc = urlfetch.create_rpc(deadline=60)
                rpc.callback = create_callback(rpc, name, url, payload)
                urlfetch.make_fetch_call(rpc, url, payload=payload, method='POST')
                rpcs.append(rpc)

            for rpc in rpcs:
                rpc.wait()
            
        check_entities(True)

    def names_generator(self, rows):
        """Generates lists of at most 10 names."""
        names = []
        for x in xrange(len(rows)):
            names.append(rows[x]['scientificname'])
            if x % 10 == 0:
                yield names
                names = []
        if len(names) > 0:
            yield names            
    
application = webapp.WSGIApplication(
    [('/backend/build_search_cache', SearchCacheBuilder),]
    , debug=True)

def main():
    run_wsgi_app(application)

if __name__ == "__main__":
    main()
