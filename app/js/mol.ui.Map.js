
/**
 * Map module that wraps a Google Map and gives it the ability to handle app
 * level events and perform AJAX calls to the server. It surfaces custom map
 * controls with predefined slots.
 * 
 * Event binding: ADD_MAP_CONTROL - Adds a control to the map. ADD_LAYER -
 * Displays the layer on the map.
 * 
 * Event triggering: None
 */
MOL.modules.Map = function(mol) { 
    
    mol.ui.Map = {};

    /**
	 * Base class for map layers.
	 */
    mol.ui.Map.MapLayer = Class.extend(
        {
            init: function(map, layer) {
                this._map = map;
                this._layer = layer;
                this._color = null;
            },
            
            // Abstract functions:
            show: function() {
                throw new mol.exceptions.NotImplementedError('show()');
            },
            hide: function() {
                throw new mol.exceptions.NotImplementedError('hide()');
            },
            isVisible: function() {                
                throw new mol.exceptions.NotImplementedError('isVisible()');
            },
            refresh: function() {
                throw new mol.exceptions.NotImplementedError('refresh()');
            },
            bounds: function() {
                throw new mol.exceptions.NotImplementedError('bounds()');
            },
            
            // Getters and setters:
            getLayer: function() {
                return this._layer;
            },
            getMap: function() {
                return this._map;           
            },
            getColor: function() {
                return this._color;
            },
            setColor: function(color) {
                this._color = color;
            },
            getConfig: function() {
                return this._config;                
            },
            setConfig: function(config) {
                this._config = config;
            }
        }
    );

    mol.ui.Map.PointLayer = mol.ui.Map.MapLayer.extend( 
        {
            init: function(map, layer, markerCanvas) {
                this._super(map, layer);
                this._markerCanvas = markerCanvas;
                this._points = null;
                this._icon = null;
                this._onMap = false;
                this._uncertaintySorter = {};
            },

            show: function() {
                var points = this._points,
                    point = null,
                    Marker = google.maps.Marker,
                    map = this.getMap(),
                    bounds = null,
                    self = this;
                if (!this.isVisible()) {
                    if (!points) {
                        this.refresh(
                            function() {
                                for (x in points) {
                                    point = points[x];
                                    point.setMap(map);
                                }
                                self._onMap = true;
                            }
                        );
                    } else {
                        for (x in points) {
                            point = points[x];
                            point.setMap(map);
                        }
                        self._onMap = true;
                    }
                }
            },

            hide: function() {
                var points = this._points;
                
                if (this.isVisible()) {
                    for (x in points) {
                        points[x].setMap(null);
                    }
                    this._onMap = false;
                }
            },

            bounds: function() {
                var points = this._points,
                    point = null,
                    Marker = google.maps.Marker,
                    bounds = new google.maps.LatLngBounds();
                if (this._bounds) {
                    return this._bounds;
                }
                for (x in points) {
                    point = points[x];
                    if (point instanceof Marker) {
                        bounds.extend(point.getPosition());
                    }
                }
                this._bounds = bounds;
                return bounds;
            },

            isVisible: function() {
                return this._onMap;
            },

            refresh: function(cb) {
                var color = this.getColor(),
                    self = this;

                this._getPointIcon(
                    function(icon) {
                        self._icon = icon;
                        if (!self._points) {
                            self._createPoints();    
                        } else {
                            self._updateLayerColor();
                        }
                        if (cb) {
                            cb();
                        }
                    }
                );  
            },

            _createPoints: function() {
                var layer = this.getLayer(),
                    lid = layer.getId(),
                    center = null,
                    marker = null,
                    circle = null,
                    coordinate = null,
                    resources = [],
                    occurrences = [],
                    data = layer._json,
                    icon = layer.getIcon(),
                    urls = this._getIconUrls(icon),
                    iconUrl = urls.iconUrl,
                    iconErrorUrl = urls.iconErrorUrl,
                    cuim = null,
                    approxCuim = null,
                    approxCoord = null,
                    makeCircle = null;
                this._points = [];
                for (p in data.records.publishers) {
                    resources = data.records.publishers[p].resources;
                    for (r in resources) {
                        occurrences = resources[r].occurrences;
                        for (o in occurrences) {
                            coordinate = occurrences[o].coordinates;
                            marker = this._createMarker(coordinate, iconUrl);
                            this._points.push(marker);
                                               
                            if (coordinate.coordinateUncertaintyInMeters != null) {
                                /*
								 * A fairly raw way to deal with lots of
								 * uncertainty circles overlapping each other.
								 * It just rounds the CUIM and the Coords and
								 * keeps a list of uniques, never recreating
								 * circles of the samish size and samish place
								 */
                                cuim = parseFloat(coordinate.coordinateUncertaintyInMeters);
                                approxCuim = Math.floor(cuim/100);
                                approxCoord = Math.floor(coordinate.decimalLatitude * 100) + ":" + Math.floor(coordinate.decimalLongitude * 100);
                                makeCircle = false;
                                if (!(approxCuim in this._uncertaintySorter)){
                                    this._uncertaintySorter[approxCuim] = {};
                                    this._uncertaintySorter[approxCuim][approxCoord] = marker;
                                    makeCircle = true;
                                } else if (!(approxCoord in this._uncertaintySorter[approxCuim])) {
                                    this._uncertaintySorter[approxCuim][approxCoord] = marker;
                                    makeCircle = true;
                                }
                                if (makeCircle) {
                                    this._points.push(this._createCircle(
                                                            marker.getPosition(),
                                                            cuim));
                                }
                            }
                        }
                    }
                }
            },

            /**
			 * Private function that creates a Google circle object.
			 * 
			 * @param center
			 *            the center LatLng of the circle
			 * @param coordinateUncertaintyInMeters
			 *            the circle radius
			 * @return a new Google circle object
			 */
            _createCircle: function(center, coordinateUncertaintyInMeters) {   

                var map = this.getMap(),
                    radius = parseFloat(coordinateUncertaintyInMeters),
                    opacity = 0.08,
                    circle = new google.maps.Circle(
                        {
                            map: map,
                            center: center,
                            clickable: false,
                            radius: radius,
                            fillColor: '#001d38',
                            strokeWeight: 0.7,                                
                            zIndex: 5
                        }
                    );

                return circle;
            },
            
            /**
			 * Private function that creates a Google marker object.
			 * 
			 * @param coordinate
			 *            the coordinate longitude and latitude
			 * @return a new Google marker object
			 */
            _createMarker: function(coordinate, iconUrl) {
                var map = this.getMap(),
                    lat = parseFloat(coordinate.decimalLatitude),
                    lng = parseFloat(coordinate.decimalLongitude),
                    center = new google.maps.LatLng(lat, lng),
                    h = this._markerCanvas.getIconHeight(),
                    w = this._markerCanvas.getIconWidth(),
                    MarkerImage = google.maps.MarkerImage,
                    Size = google.maps.Size,
                    Marker = google.maps.Marker,
                    image = new MarkerImage(iconUrl, new Size(w, h)),
                    marker = new Marker(
                        { 
                            position: center,
                            map: map,
                            icon: image
                        }
                    );
                    
                return marker;
            },
            
            _updateLayerColor: function() {
                var layer = this.getLayer(),
                    points = this._points,
                    urls = this._getIconUrls(),
                    markerCanvas = this._markerCanvas,
                    iconUrl = urls.iconUrl,
                    w = markerCanvas.getIconWidth(),
                    h = markerCanvas.getIconHeight(),
                    point = null,
                    MarkerImage = google.maps.MarkerImage,
                    Size = google.maps.Size,
                    Marker = google.maps.Marker,
                    image = new MarkerImage(iconUrl, new Size(w, h));
                
                for (x in points) {
                    point = points[x];
                    if (point instanceof Marker) {
                        point.setIcon(image);
                    }                        
                }
            },

            _getPointIcon: function(callback) {
                var icon = new Image(),
                    color = this.getColor(),
                    src = '/test/colorimage/placemark_default.png?'
                        + 'r=' + color.getRed() 
                        + '&g=' + color.getGreen() 
                        + '&b=' + color.getBlue();                

                icon.onload = function() {
                    callback(icon);
                };                

                icon.src = src;
            },
         
            _getIconUrls: function() {                
                var icon = this._icon,
                    markerCanvas = this._markerCanvas,
                    canvasSupport = markerCanvas.canvasSupport(),
                    icons = markerCanvas.getIcons(),
                    // background = icons.background,
                    // foreground = icons.foreground,
                    error = icons.error,
                    foreground = icons.foreground,
                    // background = icons.background,
                    ctx = markerCanvas.getContext(),
                    w = markerCanvas.getIconWidth(),
                    h = markerCanvas.getIconHeight(),
                    url = null,
                    errorUrl = null;

                if (!canvasSupport) {
                    return {iconUrl: icon.src, iconErrorUrl: icon.src};
                }
                
                // ctx.drawImage(background, 0, 0, w, h);
                // ctx.drawImage(background, 0, 0, w, h);
                ctx.drawImage(icon, 0, 0, w, h);
                ctx.drawImage(foreground, 0, 0, w, h);
                // ctx.drawImage(foreground, 0, 0, w, h);
                url = markerCanvas.getDataURL();
                ctx.drawImage(error, 0, 0, w, h);
                errorUrl = markerCanvas.getDataURL();

                return {iconUrl: url, iconErrorUrl: errorUrl};
            }
        }
    );
    
    mol.ui.Map.TileLayer = mol.ui.Map.MapLayer.extend(
        {
		    
            init: function(map, layer) {
                this._super(map, layer);
                this._mapType = null;
                this._onMap = false;
            },
            
            // Abstract functions:
            _getTileUrlParams: function() {
                throw mol.exceptions.NotImplementedError('_getTileUrlParams()');
            },
            
            show: function() {
                var layer = this.getLayer(),
                    layerInfo = layer.getInfo(),
                    north = null,
                    west = null,
                    south = null,
                    east = null,
                    bounds = this.bounds(),
                    LatLngBounds = google.maps.LatLngBounds,
                    LatLng = google.maps.LatLng,
                    map = this.getMap();
                if (!this.isVisible()) {
                    if (!this._mapType) {
                        this.refresh();
                    }
                    this.getMap().overlayMapTypes.push(this._mapType);
                    this._onMap = true;
                }
            },

            /**
			 * Returns a google.maps.LatLngBounds for this layer.
			 */
            bounds: function() {                
                var layer = this.getLayer(),
                    extent = layer.getExtent(), // GeoJSON bounding box as
												// polygon
                    north = extent[0][2][1],
                    west = extent[0][0][0],
                    south = extent[0][0][1],
                    east = extent[0][2][0],
                    bounds = new google.maps.LatLngBounds(),
                    LatLng = google.maps.LatLng;
                if (this._bounds) {
                    return this._bounds;
                }
                bounds.extend(new LatLng(north, west));
                bounds.extend(new LatLng(south, east));
                this._bounds = bounds;
                return bounds;
            },

            hide: function() {
                var layerId = this.getLayer().getId(),
                    map = this.getMap();

                if (this.isVisible()) {
                    map.overlayMapTypes.forEach(
                        function(x, i) {
                            if (x && x.name === layerId) {
                                map.overlayMapTypes.removeAt(i);
                            }
                        }
                    );
                    this._onMap = false;
                }
            },
                        
            isVisible: function() {
                return this._onMap;
            },

            refresh: function() {              
                var self = this,
                	map = this._map,
                    layerId = this.getLayer().getId(),
                    layerSource = this.getLayer().getSource(),
                    layerType = this.getLayer().getType(),
                    layerName = this.getLayer().getName(),
                    config = this.getLayer().getConfig(),
                    color = this.getColor();

                if (google.maps.CartoDBLayer) {

                    // TODO: Is this needed?
                	window.map = map;

                	new google.maps.CartoDBLayer({
                		map_canvas : 'map',
        				map : map,
        				user_name : config.user,
        				table_name : config.table,
        				query : "select * from " + config.table + " where scientific = '" + layerName + "'",
        				map_style : true,
        				infowindow : true,
        				layerId: layerId,
        				columns: ['scientific', 'bibliograp', 'collection', 'contact', 'creator','descriptio'],
        				auto_bound: false
        			});
        		}
            },

            _getNormalizedCoord: function(coord, zoom) {
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
            }
        }
    );
    mol.ui.Map.CartoTileLayer = mol.ui.Map.MapLayer.extend(
        {
    	    getSqlUrl: function(sql) {
    		    var config = this.getLayer().getConfig(),
    		    	url = 'http://' + config.user + ".cartodb.com/api/v1/sql?q=" + encodeURIComponent(sql) + "&format=geojson&dp=6";
    		    if (config.debug) {
    		    	mol.log.info(url);
    		    };
    		    return url;
    	    },
    	    fetchTile: function(x, y, zoom, callback) {
    		    var self = this,
    		    	config = this.getLayer().getConfig(),
    		    	projection = new MercatorProjection(),
    		        tile_point = projection.tilePoint(x, y, zoom),
    		        bbox = projection.tileBBox(x, y, zoom),
    		        geom_column = "the_geom",
    		        the_geom = null,
    		        columns = null,
    		        sql = null,
                    data = self._cache[sql];
    		    if (zoom >= 17){
    		    	the_geom = geom_column;
    		    } else if (zoom >= 14 ){
    		    	the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.000001) as the_geom';
    		    } else if (zoom >= 10){
    		    	the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.0001) as the_geom';
    		    } else if (zoom >=6){
    		    	the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.001) as the_geom';
    		    } else if (zoom >= 4){
    		    	the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.01) as the_geom';
    		    } else {
    		    	the_geom = 'ST_SimplifyPreserveTopology("'+geom_column+'",0.1) as the_geom';
    		    }
    		    columns = [the_geom].concat(config.columns).join(',');
    		    sql = "select " + columns + " from " + config.table + " where scientific = '" + this.getLayer().getName() + "'";
    		    if (zoom >= 3) {
    		    	sql += " and the_geom && ST_SetSRID(ST_MakeBox2D(";
    		    	sql += "ST_Point(" + bbox[0].lng() + "," + bbox[0].lat() +"),";
    		    	sql += "ST_Point(" + bbox[1].lng() + "," + bbox[1].lat() +")), 4326)";
    		    }
    		    if (data) {
    	            if (config.debug) {
    	            	mol.log.info("CACHED");
        		    };
    	            callback(data);
    		    } else {
    			    $.getJSON(
                        this.getSqlUrl(sql), 
                        function(data) {
    		                self._cache[sql] = data;
    		                callback(data);
    		            }
                    );
    		    }
    	    },
    	    applyStyle: function(ctx, data) {
    	        var css = CartoCSS.apply(this.getLayer().getConfig().getStyle().toString(), data),
                    c = null,
    	            mapper = {
    	                'point-color': 'fillStyle',
    	                'line-color': 'strokeStyle',
    	                'line-width': 'lineWidth',
    	                'polygon-fill': 'fillStyle'
    	            };

    	        for (var attr in css) {
    	            c = mapper[attr];
    	            if (c) {
    	                ctx[c] = css[attr];
    	            }
    	        }
    	    },

    	    mapLatLon: function (latlng, x, y, zoom) {
                latlng = new google.maps.LatLng(latlng[1], latlng[0]);
                return this._projection.latLngToTilePoint(latlng, x, y, zoom);        
            },

            getCallback: function(parent, ctx, layer_ctx, x, y, zoom, layer_canvas) {
            	var primitive_render = parent.primitive_render;

            	return function(data) {
                    var tile_point = parent._projection.tilePoint(x, y, zoom),
                        primitives = data.features,
                        renderer = null;

                    if (primitives.length) {
                        for(var i = 0; i < primitives.length; ++i) {
                            // reset primitive layer context
                            layer_ctx.clearRect(0,0,layer_canvas.width,layer_canvas.height);
                            // get layer geometry
                            renderer = primitive_render[primitives[i].geometry.type];
                            
                            // render layer, calculate hitgrid and composite
							// onto
					        // main ctx
                            if (renderer) {
                                parent.applyStyle(layer_ctx, primitives[i].properties);
                                renderer(layer_ctx, x, y, zoom, primitives[i].geometry.coordinates);
                                
                                // here is where we would calculate hit grid
                                // TODO: Implement hit grid :D
                                
                                // composite layer context onto main context
                                ctx.drawImage(layer_canvas,0,0);
                                if (!parent.isVisible()) {
                                	$(layer_canvas).hide();
                                }
                            } else {
                            	mol.log.error("no renderer for ", primitives[i].geometry.type);
                            }
                        }
                    }
                };
            },

    	    renderTile: function(tile_info, coord, zoom) {
    		    var self = this,
    		    	ctx = tile_info.ctx,
                    layer_canvas = null,
                    layer_ctx = null;
                
                // draw each primitive onto its own blank canvas to allow us to
			    // build up a hitgrid
                // Fast in chrome, slow in safari
                layer_canvas  = document.createElement('canvas');
                layer_canvas.width  = ctx.width;
                layer_canvas.height = ctx.height;
                layer_ctx = layer_canvas.getContext('2d');
                
                tile_info.canvas.width = tile_info.canvas.width; // clear canvas for redraw
                self.fetchTile(
                    coord.x,
                    coord.y, 
                    zoom,
                    self.getCallback(self, ctx, layer_ctx, coord.x, coord.y, zoom, layer_canvas)
                );                
            },
            /**
			 * Map Types Functions
			 * 
			 * @See http://code.google.com/apis/maps/documentation/javascript/maptypes.html
			 */
            getTile: function(coord, zoom, ownerDocument) {
    		    var self = this,
                    canvas = ownerDocument.createElement('canvas'),
                    ctx = null,
                    tile_id = null,
					primitive_render = self.primitive_render;

    	        canvas.style.border  = "none";
    	        canvas.style.margin  = "0";
    	        canvas.style.padding = "0";
    	        
    	        // prepare canvas and context sizes
    	        ctx = canvas.getContext('2d');
    	        ctx.width  = canvas.width = this.tileSize.width;
    	        ctx.height = canvas.height = this.tileSize.height;
    	        
    	        tile_id = coord.x + '_' + coord.y + '_' + zoom;
    	        canvas.setAttribute('id', tile_id);
    	        
    	        if (tile_id in this._tiles) {
    	    	    delete this._tiles[tile_id];
    	        } else {
    	    	    self.fetchTile(
                        coord.x, 
                        coord.y, 
                        zoom,
                        self.getCallback(self, ctx, ctx, coord.x, coord.y, zoom, canvas)
                    );
    	        }
    	        self._tiles[tile_id] = {canvas: canvas, ctx: ctx, coord: coord, zoom: zoom};    	        
    	        return canvas;
    	    },

    	    releaseTile: function(tileCanvas) {
    	    	var self = this,
    	    		tile_id = tileCanvas.getAttribute('id');
    	    	delete self._tiles[tile_id];
    	    },

    	    /**
			 * Inherited methods from parent class
			 */
    	    init: function(map, layer) {
				var self = this;
			    this.tileSize = new google.maps.Size(256,256);
			    this._map = map;
			    this._onMap = true;
			    this._layer = layer;
			    this._projection = new MercatorProjection();
			    this._cache = {}; // cache stores geojson data
			    this._tiles = {}; // stores the actual image
			    this._map.overlayMapTypes.insertAt(0, this);
				this.primitive_render = {
    	            Point: function(ctx, x, y, zoom, coordinates) {
	                    ctx.save();
	                    var radius = 2;
	                    var p = self.mapLatLon(coordinates, zoom);
	                    ctx.translate(p.x, p.y);
	                    ctx.beginPath();
	                    ctx.arc(radius, radius, radius, 0, Math.PI * 2, true);
	                    ctx.closePath();
	                    ctx.fill();
	                    ctx.stroke();
	                    ctx.restore();
		            },
		            MultiPoint: function(ctx, x, y,zoom, coordinates) {
		                var prender = self.primitive_render.Point;
		                for (var i=0; i < coordinates.length; ++i) {
		                    prender(ctx, zoom, coordinates[i]);
		                }
		            },
		            Polygon: function(ctx, x, y, zoom, coordinates) {
                        var p = null;
                            
		                ctx.beginPath();
		                p = self.mapLatLon(coordinates[0][0], x, y, zoom);
		                ctx.moveTo(p.x, p.y);
		                for (var i=0; i < coordinates[0].length; ++i) {
		                    p = self.mapLatLon(coordinates[0][i], x, y, zoom);
		                    ctx.lineTo(p.x, p.y);
		                }
		                ctx.closePath();
		                ctx.fill();
		                ctx.stroke();
		            },
		            MultiPolygon: function(ctx, x, y, zoom, coordinates) {
		                var prender = self.primitive_render.Polygon;
		                for (var i=0; i < coordinates.length; ++i) {
		                    prender(ctx, x, y, zoom, coordinates[i]);
		                }
		            }
		        };
    	    },

    	    show: function() {
	    	    var layer = this.getLayer(),
	    	        bounds = this.bounds(),
	    	        LatLngBounds = google.maps.LatLngBounds,
                    LatLng = google.maps.LatLng,
                    map = this.getMap(),
                    tile = null;

	    	    if (!this.isVisible()) {
	    	    	for (var t in this._tiles) {
		                tile = this._tiles[t];
		                $(tile.canvas).show();
		            }
	    	    	// this.refresh();
                    this._onMap = true;
	    	    }
	        },

	        hide: function() {
	        	var tile = null;

	            if (this.isVisible()) {
	                for (var t in this._tiles) {
		                tile = this._tiles[t];
		                $(tile.canvas).hide();
		            }
	                this._onMap = false;
	            }
	        },

	        isVisible: function() {
	        	return this._onMap;
	        },

	        refresh: function() {
                var tile = null;

	            for (var t in this._tiles) {
	                tile = this._tiles[t];
	                this.renderTile(tile, tile.coord, tile.zoom);
	            }
	        },

	        bounds: function() {
	        	var layer = this.getLayer(),
                extent = layer.getExtent(), // GeoJSON bounding box as polygon											
                north = extent[0][2][1],
                west = extent[0][0][0],
                south = extent[0][0][1],
                east = extent[0][2][0],
                bounds = new google.maps.LatLngBounds(),
                LatLng = google.maps.LatLng;

	            if (this._bounds) {
	                return this._bounds;
	            }
	            bounds.extend(new LatLng(north, west));
	            bounds.extend(new LatLng(south, east));
	            this._bounds = bounds;
	            return bounds;
	        }
        }
    );
    
    /**
	 * The Map Engine.
	 */
    mol.ui.Map.Engine = mol.ui.Engine.extend(
        {
            /**
			 * Constucts a new Map Engine.
			 * 
			 * @param api
			 *            the mol.ajax.Api for server communication
			 * @param bus
			 *            the mol.events.Bus for event handling
			 * @constructor
			 */
            init: function(api, bus) {
                this._api = api;
                this._bus = bus;
                this._controlDivs = {};
                this._mapLayers = {};
            },            

            _addMapLayer: function(map, layer) {
                var layerId = layer.getId(),
                    layerType = layer.getType(),
                    mapLayer = null;

                switch (layerType) {
                case 'points':
                    mapLayer = new mol.ui.Map.PointLayer(map, layer, this._markerCanvas);
                    break;
                case 'range':
                case 'ecoregion':
                case 'pa':
                	/*
                	 * Switching between CartoTileLayer (Canvas) and TileLayer (Tile)
                	 */
                    mapLayer = new mol.ui.Map.TileLayer(map, layer);
                    break;
                }
                this._mapLayers[layerId] = mapLayer;
            },

            _mapLayerExists: function(layerId) {
                return this._mapLayers[layerId] !== undefined;
            },
            
            _getMapLayer: function(layerId) {
                return this._mapLayers[layerId];
            },

            _removeMapLayer: function(layerId) {
                var mapLayer = this._getMapLayer(layerId);

                if (!mapLayer) {
                    return false;
                }

                mapLayer.hide();
                delete this._mapLayers[layerId];                
                return true;
            },
            
            /**
			 * Starts the engine and provides a container for its display.
			 * 
			 * @param container
			 *            the container for the engine display
			 * @override mol.ui.Engine.start
			 */
            start: function(container) {
                var MarkerCanvas = mol.ui.Map.MarkerCanvas;

                this._bindDisplay(new mol.ui.Map.Display(), container);

                this._markerCanvas = new MarkerCanvas(21, 18);

                this._addMapControlEventHandler();
                this._addLayerEventHandler();
                this._addColorEventHandler();
            },

            /**
			 * Gives the engine a new place to go based on a browser history
			 * change.
			 * 
			 * @param place
			 *            the place to go
			 * @override mol.ui.Engine.go
			 */
            go: function(place) {
                var ll = place.ll ? place.ll.split(',') : null,
                    latlng = ll ? new google.maps.LatLng(parseFloat(ll[0]), parseFloat(ll[1])) : null,
                    z = place.z,
                    zoom = z ? parseInt(z) : null,
                    map = this._map;

                if (latlng) {
                    map.setCenter(latlng);
                }

                if (zoom) {
                    map.setZoom(zoom);
                }
            },

            getPlaceState: function() {
                var map = this._map;

                return {
                    ll: map.getCenter().toUrlValue(),
                    z: map.getZoom()
                };
            },

            _bindDisplay: function(display, container) {
                this._display = display;
                display.setEngine(this);                

                container.append(display.getElement());
                
                this._map = display.getMap();

                this._addControls();
            },

            _addControls: function() {
                var map = this._map,
                    controls = map.controls,
                    ControlPosition = google.maps.ControlPosition,
                    TOP_RIGHT = ControlPosition.TOP_RIGHT,
                    TOP_CENTER = ControlPosition.TOP_CENTER,
                    BOTTOM_LEFT = ControlPosition.BOTTOM_LEFT,
                    TOP_LEFT = ControlPosition.TOP_LEFT,
                    Control = mol.ui.Map.Control;
                
                this._rightControl = new Control('RightControl');
                controls[TOP_RIGHT].clear();
                controls[TOP_RIGHT].push(this._rightControl.getDiv());
                                
                this._centerTopControl = new Control('CenterTopControl');
                controls[TOP_CENTER].clear();
                controls[TOP_CENTER].push(this._centerTopControl.getDiv());

                this._leftTopControl = new Control('TopLeftControl');
                controls[TOP_LEFT].clear();
                controls[TOP_LEFT].push(this._leftTopControl.getDiv());  
                
                this._leftBottomControl = new Control('LeftBottomControl');
                controls[BOTTOM_LEFT].clear();
                controls[BOTTOM_LEFT].push(this._leftBottomControl.getDiv());                
            },

            /**
			 * Adds an event handler for new layers.
			 */
            _addLayerEventHandler: function() {
                var bus = this._bus,
                    map = this._map,
                    LayerEvent = mol.events.LayerEvent,
                    LayerControlEvent = mol.events.LayerControlEvent,
                    layers = this._layers,
                    self = this,
                    ColorEvent = mol.events.ColorEvent;
                
                bus.addHandler(
                    LayerControlEvent.TYPE,
                    function(event) {
                        var action = event.getAction(),
                            layerId = event.getLayerId();
                        if (action === 'delete-click') {                            
                            self._removeMapLayer(layerId);
                        }
                    }
                );

                bus.addHandler(
                    LayerEvent.TYPE,
                    function(event) {
                        var layer = event.getLayer(),
                            layerId = layer ? layer.getId() : null,     
                            zoomLayerIds = event.getZoomLayerIds(),
                            mapLayer = layerId ? self._getMapLayer(layerId) : null,                        
                            action = event.getAction(),
                            bounds = new google.maps.LatLngBounds(),
                            colorEventConfig = {};
                        switch (action) {

                        case 'add':
                            if (mapLayer) {
                                return;
                            }                            
                            self._addMapLayer(map, layer);
                            colorEventConfig = {
                            	action: 'get',
                            	category: layer.getType(),
                            	id: layerId
                            };
                            bus.fireEvent(new ColorEvent(colorEventConfig));
                            break;
                        case 'zoom':
                            if (zoomLayerIds.length !== 0) {
                                for (x in zoomLayerIds) {
                                    bounds.union(self._getMapLayer(zoomLayerIds[x]).bounds());
                                }
                                map.fitBounds(bounds);
                            }
                            break;
                        case 'delete':
                            if (!mapLayer) {
                                return;
                            }    
                            self._removeMapLayer(layerId);
                            break;

                        case 'checked':
                            if (mapLayer) {
                                mapLayer.show();
                            }                                
                            break;                            

                        case 'unchecked':
                            if (mapLayer) {
                                mapLayer.hide();
                            }    
                            break;
                        case 'update_style':
                        	if (mapLayer instanceof mol.ui.Map.CartoTileLayer || mapLayer instanceof mol.ui.Map.TileLayer) {
                        		mapLayer.refresh();
                                mapLayer.hide();
                                mapLayer.show();
                        	}
                        	break;
                        }
                    }
                );
            },
            
            /**
			 * Adds an event handler so that displays can be added to the map as
			 * controls simply by firing a MapControlEvent.
			 */
            _addMapControlEventHandler: function() {
                var bus = this._bus,
                    MapControlEvent = mol.events.MapControlEvent,
                    controls = this._map.controls,
                    controlDivs = this._controlDivs,
                    ControlPosition = mol.ui.Map.Control.ControlPosition,
                    TOP_RIGHT = ControlPosition.TOP_RIGHT,
                    TOP_CENTER = ControlPosition.TOP_CENTER,
                    BOTTOM_LEFT = ControlPosition.BOTTOM_LEFT,
                    TOP_LEFT = ControlPosition.TOP_LEFT,
                    topRightControl = this._rightControl,
                    leftTopControl = this._leftTopControl,
                    centerTopControl = this._centerTopControl,
                    leftBottomControl = this._leftBottomControl;
                                
                bus.addHandler(
                    MapControlEvent.TYPE,
                    function(event) {
                        var action = event.getAction(),
                            display = event.getDisplay(),
                            controlPosition = event.getControlPosition(),
                            displayPosition = event.getDisplayPosition(),
                            control = null;

                        switch (action) {

                        case 'add':
                            switch (controlPosition) {
                                
                            case TOP_RIGHT:
                                control = topRightControl;
                                break;
                                
                            case TOP_CENTER:
                                control = centerTopControl;
                                break;

                            case TOP_LEFT:
                                control = leftTopControl;
                                break;

                            case BOTTOM_LEFT:
                                control = leftBottomControl;
                                break;
                            }
                            control.addDisplay(display, displayPosition);
                            break;

                        case 'remove':
                            // TODO: Remove custom map control.
                            mol.log.todo('Remove custom map control');
                            break;                            
                        }
                    }
                );
            },

            _addColorEventHandler: function() {
                var ColorEvent = mol.events.ColorEvent,
                    bus = this._bus,
                    self = this;

                bus.addHandler(
                    ColorEvent.TYPE,
                    function(event) {
                        var color = event.getColor(),
                            category = event.getCategory(),
                            layerId = event.getId(),
                            mapLayer = self._getMapLayer(layerId),
                            action = event.getAction();

                        // Ignores event:
                        if (!mapLayer) {
                            return;
                        }

                        switch (action) {
                        case 'change':                        
                            mapLayer.setColor(color);
                            mapLayer.show();
                            break;
                        }                           
                    }
                );
            },
            
            _updateLayer: function(layer) {
                _updateLayerColor(layer);
            }
        }
    );

    /**
	 * The top level placemark canvas container
	 */
    mol.ui.Map.MarkerCanvas = mol.ui.Element.extend(
        {
            init: function(width, height) {
                var MarkerCanvas = mol.ui.Map.MarkerCanvas;
                
                this._canvasSupport = !!document.createElement('canvas').getContext;

                if (!this._canvasSupport) {
                    this._super();
                    return;
                }

                this._iconHeight = height;
                this._iconWidth = width;

                this._super('<canvas width=' + this._iconWidth + 
                            ' height=' + this._iconHeight + '>');

                this.setStyleName('mol-MarkerCanvas');

                this._ctx = this.getElement()[0].getContext("2d");

                this._iconLayers = {
                    // background: new Image(),
                    foreground: new Image(),
                    error: new Image()
                };
                // this._iconLayers.background.src =
				// "/static/maps/placemarks/placemark-background.png";
                this._iconLayers.foreground.src = "/static/maps/placemarks/placemark-foreground.png";
                this._iconLayers.error.src = "/static/maps/placemarks/placemark-error.png";
            },
            
            getIconWidth: function() {
                return this._iconWidth;
            },
            
            getIconHeight: function() {                
                return this._iconHeight;
            },

            getIcons: function() {
                return this._iconLayers;
            },
            
            canvasSupport: function() {
                return this._canvasSupport;
            },

            getContext: function() {
                return this._ctx;
            },

            getDataURL: function(){
                return this.getElement()[0].toDataURL("image/png");
            }
        }
    );
    

    mol.ui.Map.Control = mol.ui.Display.extend(
        {
            init: function(name) {
                var DisplayPosition = mol.ui.Map.Control.DisplayPosition,
                    TOP = DisplayPosition.TOP,
                    MIDDLE = DisplayPosition.MIDDLE,
                    BOTTOM = DisplayPosition.BOTTOM;

                this._super();
                this.disableSelection();
                
                this.setInnerHtml(this._html(name));

                this.setStyleName('mol-Map-' + name);

                this.findChild(TOP).setStyleName("TOP");
                this.findChild(MIDDLE).setStyleName("MIDDLE");
                this.findChild(BOTTOM).setStyleName("BOTTOM");
            },
                       
            getDiv: function() {
                return this.getElement()[0];                
            },
            
            /**
			 * @param display -
			 *            the mol.ui.Display to add
			 * @param position -
			 *            the mol.ui.Map.Control.DisplayPosition
			 */
            addDisplay: function(display, position) {
                var DisplayPosition = mol.ui.Map.Control.DisplayPosition,
                    div = this.findChild(position);

                switch (position) {
                
                case DisplayPosition.FIRST:
                    this.prepend(display);
                    break;

                case DisplayPosition.LAST:
                    this.append(display);
                    break;

                default:            
                    div.append(display);
                }
            },

            _html: function(name) {
                return '<div id="' + name + '">' +
                       '    <div class="TOP"></div>' +
                       '    <div class="MIDDLE"></div>' +
                       '    <div class="BOTTOM"></div>' +
                       '</div>';
            }
        }
    );

    mol.ui.Map.Control.DisplayPosition = {
        FIRST: '.FIRST',
        TOP: '.TOP',
        MIDDLE: '.MIDDLE',
        BOTTOM: '.BOTTOM',
        LAST: '.LAST'
    };

    mol.ui.Map.Control.ControlPosition = {
        TOP_RIGHT: 'TOP_RIGHT',
        TOP_CENTER: 'TOP_CENTER',
        TOP_LEFT: 'TOP_LEFT',
        LEFT_BOTTOM: 'LEFT_BOTTOM'        
    };


    /**
	 * The Map Display. It's basically a Google map attached to the 'map' div in
	 * the <body> element.
	 */
    mol.ui.Map.Display = mol.ui.Display.extend(
        {

            /**
			 * Constructs a new Map Display.
			 * 
			 * @param config
			 *            the display configuration
			 * @constructor
			 */
            init: function(config) {
                var mapOptions = {
                    zoom: 2,
                    maxZoom: 15,
                    mapTypeControlOptions: {position: google.maps.ControlPosition.BOTTOM_LEFT},
                    center: new google.maps.LatLng(0,0),
                    mapTypeId: google.maps.MapTypeId.ROADMAP,
                    styles: [
                        {"featureType":"all",
                         "elementType":"all",
                         "stylers":[{"lightness":43},{"visibility":"simplified"},{"saturation":-59}]
                        },
                        {
                            "elementType":"labels","stylers":[{"visibility":"on"}]
                        }

                    ]
                };
                
                this._id = 'map';
                this._super($('<div>').attr({'id': this._id}));
                $('body').append(this.getElement());
                this._map = new google.maps.Map($('#' + this._id)[0], mapOptions);
            },         
            
            
            /**
			 * Returns the Google map object.
			 */
            getMap: function() {
                return this._map;
            },

            /**
			 * Returns the Google map controls array.
			 */
            getMapControls: function() {
                return this._map.controls;
            }            
        }
    );

};
