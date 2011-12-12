/**
 * An app that experiments with a Map of Life integration with Google Earth Engine.
 * 
 * @author Aaron Steele (eightysteele@gmail.com)
 */

// Global app object.
var app = app || {};

// Container for the URL query parameters.
app.urlParams = {};

// Container for polygons that are drawn on the map.   
app.polygons = [];

/**
 * Returns normalized coordinates used by a Google Maps tile request.
 * 
 * @param coord The coordinate with x and y values.
 * @param zoom The map zoom level.
 */
app._getNormalizedCoord = function(coord, zoom) {
    var y = coord.y,
        x = coord.x,
        tileRange = 1 << zoom;

    // don't repeat across y-axis (vertically)
    if (y < 0 || y >= tileRange) {
        return null;
    }

    // repeat across x-axis
    if (x < 0 || x >= tileRange) {
        x = (x % tileRange + tileRange) % tileRange;
    }
    return {
        x: x,
        y: y
    };
};

/**
 * Calculates statistics for a polygon drawn on the map.
 * 
 * @param polygon The google.maps.Polygon object.
 */
app.calcStats = function(polygon) {    
    var center = polygon.getBounds().getCenter();

    // Listener for when the polygon is edited.
    google.maps.event.addListener(
        polygon.getPath(), 
        'set_at', 
        function(data) {
            app.calcStats(polygon);
        }
    );
    
    app.loadingImg.show();

    // Get coordinates from the polygon.
    app.coordinates = [[]];
    polygon.getPath().forEach(
        function(latLng) {
            app.coordinates[0].push([latLng.lng(), latLng.lat()]);
        }
    );
    
    // Add polygon to the list of polygons visible on map.
    app.polygons.push(polygon);

    app.loadingImg.show();
    app.infowin.close();
    
    // Request stats asynchronously and display them in an info window when ready.
    $.post(
        '/earthengine/stats',
        {
            tableids: app.urlParams['tableids'], 
            coordinates: JSON.stringify(app.coordinates),
            center: center.toUrlValue()
        },
        function(data) {  
            var result = JSON.parse(data),
                request = decodeURI(result['request']),
                response = result['response'], 
                stats = JSON.stringify(response['data'], undefined, 2),            
                point = app.coordinates[0][0],
                latlng = new google.maps.LatLng(point[1], point[0]);
            
            if (app.logging) {
                console.log('Request: ' + request);
                console.log('Response: ' + JSON.stringify(response));                    
            }

            app.infowin.setContent('Stats: ' + stats);
            app.infowin.setPosition(latlng);
            app.infowin.open(app.map);
            app.loadingImg.hide();
        }
    );        
};

/**
 * Initializes the application. 
 */
app.init = function () {
    var e,
        a = /\+/g,  // Regex for replacing addition symbol with a space
        r = /([^&=]+)=?([^&]*)/g,
        d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
        q = window.location.search.substring(1),
        tableids = null,
        tableid,
        latlng = new google.maps.LatLng(-10, -80);

    // Parses URL parameters:
    while ((e = r.exec(q))) {
        app.urlParams[d(e[1])] = d(e[2]);
    }

    // Gettable ids from the URL query string.
    tableids = app.urlParams['tableids'].split(',');

    // Setup the Google map.
    app.mapOptions = {
        mapTypeId: google.maps.MapTypeId.TERRAIN,
        center: latlng
    };
    app.map = new google.maps.Map(document.getElementById("map_canvas"), app.mapOptions);
    app.map.setZoom(2);

    // Setup loading image.
    app.loadingImg = $('<div id="loader"><img id="loadgif" src="/js/loading.gif"/><span id="loadcount"></span></div>'); 
    app.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(app.loadingImg[0]);
    app.loadingImg.hide();
    
    // Setup the clear polygons button.
    app.clearButton = $('<div><button id="clearMapButton"  style="top: 3px;" width="200px">Clear Polygons</button></div>'); 
    app.clearButton.click(
        function(event) {
            for (x in app.polygons) {
               app.polygons[x].setMap(null); 
            }
            app.polgons = [];
            app.infowin.close();
        }
    );

    // Add clear button and loading image as map controls.
    app.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(app.clearButton[0]);
    app.map.controls[google.maps.ControlPosition.TOP_CENTER].push(app.loadingImg[0]);

    // Setup a single info window for the app.
    app.infowin = new google.maps.InfoWindow();

    // Setup for getting mouse click polygon intersection count.
    google.maps.event.addListener(
        app.map, 
        'click', function(event) {
            app.loadingImg.show();
            app.infowin.close();
            $.post(
                '/earthengine/intersect',
                {tableids: app.urlParams['tableids'], ll:event.latLng.toUrlValue()},
                function(data) {  
                    var result = JSON.parse(data),
                        request = decodeURI(result['request']),
                        response = result['response'], 
                        ic = response['data']['points'][0]['bands']['intersectionCount'][0];
                    
                    if (app.logging) {
                        console.log('Request: ' + request);
                        console.log('Response: ' + JSON.stringify(response));                    
                    }

                    app.infowin.setContent('Intersection count: ' + ic);
                    app.infowin.setPosition(event.latLng);
                    app.infowin.open(app.map);
                    app.loadingImg.hide();
                }
            );
        }
    );
        
    // Setup map tiles.
    $.post(
        '/earthengine/mapid', 
        {
            tableids: app.urlParams['tableids'], 
            min: app.urlParams['min'], 
            max: app.urlParams['max']
        },
        function (data) {
            var result = JSON.parse(data),
                request = decodeURI(result['request']),
                response = result['response'], 
                mapid = null,
                token = null,
                tableid = null,
                tileUrl = null,
                base_url = 'http://earthengine.googleapis.com/map/';

            for (i in result) {
                response = result[i]['response']['data'];
                mapid = response['mapid'];
                token = response['token'];
                tableid = response['tableid'];
                
                if (app.logging) {
                    console.log('Request: ' + request);
                    console.log('Response: ' + JSON.stringify(response));                    
                }

                app.map.overlayMapTypes.push(
                    new google.maps.ImageMapType(
                        {
                            getTileUrl: function(coord, zoom) {
                                tileUrl = base_url + mapid + "/"+ zoom + "/"+ coord.x + "/" + coord.y +"?token=" + token;
                                return tileUrl;
                            },
                            tileSize: new google.maps.Size(256, 256),
                            isPng: true,
                            name: tableid
                        }
                    )
                );
            }
        }
    );

    // Setup drawing manager for polygons.
    app.drawingManager = new google.maps.drawing.DrawingManager(
        {
            drawingMode: null,
            drawingControl: true,
            drawingControlOptions: {
                position: google.maps.ControlPosition.TOP_RIGHT,
                drawingModes: [
                    google.maps.drawing.OverlayType.POLYGON
                ]
            },
            markerOptions: {
                icon: 'images/beachflag.png'
            },
            polygonOptions: {
                fillColor: '#ffff00',
                fillOpacity: .5,
                strokeWeight: 0,
                clickable: false,
                editable: true,
                zIndex: 1
            }
        }
    );
    app.drawingManager.setMap(app.map);

    // Setup stats call when polygons are drawn.
    google.maps.event.addListener(
        app.drawingManager, 
        'polygoncomplete', 
        function(polygon) {
            app.calcStats(polygon);
        }

    );    

    /**
     * Pass each point of the polygon to a LatLngBounds object through the 
     * extend() method, and then finally call the getCenter() method on the 
     * LatLngBounds object.
     * 
     * Modified version of: 
     *   http://code.google.com/p/google-maps-extensions/source/browse/google.maps.Polygon.getBounds.js
     */
    if (!google.maps.Polygon.prototype.getBounds) {
        google.maps.Polygon.prototype.getBounds = function(latLng) {            
            var bounds = new google.maps.LatLngBounds(),
                paths = this.getPaths(),
                path;
                
            for (var p = 0; p < paths.getLength(); p++) {
                path = paths.getAt(p);
                for (var i = 0; i < path.getLength(); i++) {
                    bounds.extend(path.getAt(i));
                }
            }
            
            return bounds;
        };

    }
};