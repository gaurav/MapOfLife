
/**
 * Map module that wraps a Google Map and gives it the ability to handle app 
 * level events and perform AJAX calls to the server. It surfaces custom
 * map controls with predefined slots. 
 * 
 * Event binding:
 *     ADD_MAP_CONTROL - Adds a control to the map.
 *     ADD_LAYER - Displays the layer on the map.
 * 
 * Event triggering:
 *     None
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
                console.log("Starting map render: " + new Date().getTime());

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

                console.log("Starting map render: " + new Date().getTime());
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
                                 * A fairly raw way to deal with lots of uncertainty circles
                                 * overlapping each other. It just rounds the CUIM and the 
                                 * Coords and keeps a list of uniques, never recreating circles
                                 * of the samish size and samish place
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
             * @param center the center LatLng of the circle
             * @param coordinateUncertaintyInMeters the circle radius
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
             * @param coordinate the coordinate longitude and latitude
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
                    //background = icons.background,
                    //foreground = icons.foreground,
                    error = icons.error,
                    foreground = icons.foreground,
                    //background = icons.background,
                    ctx = markerCanvas.getContext(),
                    w = markerCanvas.getIconWidth(),
                    h = markerCanvas.getIconHeight(),
                    url = null,
                    errorUrl = null;

                if (!canvasSupport) {
                    return {iconUrl: icon.src, iconErrorUrl: icon.src};
                }
                
                //ctx.drawImage(background, 0, 0, w, h);
                //ctx.drawImage(background, 0, 0, w, h);
                ctx.drawImage(icon, 0, 0, w, h);
                ctx.drawImage(foreground, 0, 0, w, h);
                //ctx.drawImage(foreground, 0, 0, w, h);
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

            bounds: function() {
                var layer = this.getLayer(),
                    layerInfo = layer.getInfo(),
                    north = null,
                    west = null,
                    south = null,
                    east = null,
                    bounds = new google.maps.LatLngBounds(),
                    LatLng = google.maps.LatLng;
                if (this._bounds) {
                    return this._bounds;
                }
                if (layerInfo && layerInfo.extentNorthWest && layerInfo.extentSouthEast) {
                    north = parseFloat(layerInfo.extentNorthWest.split(',')[0]),
                    west = parseFloat(layerInfo.extentNorthWest.split(',')[1]),
                    south = parseFloat(layerInfo.extentSouthEast.split(',')[0]),
                    east = parseFloat(layerInfo.extentSouthEast.split(',')[1]),
                    bounds.extend(new LatLng(north, west));
                    bounds.extend(new LatLng(south, east));
                } 
                this._bounds = bounds;
                return bounds;
            },

            hide: function() {
                var keyName = this.getLayer().getKeyName(),
                    map = this.getMap();

                if (this.isVisible()) {
                    map.overlayMapTypes.forEach(
                        function(x, i) {
                            if (x && x.name === keyName) {
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
                    keyName = this.getLayer().getKeyName(),
                    layerSource = this.getLayer().getSource(),
                    layerType = this.getLayer().getType(),
                    color = this.getColor();

                this._mapType = new google.maps.ImageMapType(
                    {
                        getTileUrl: function(coord, zoom) {
                            var normalizedCoord = self._getNormalizedCoord(coord, zoom),
                                bound = Math.pow(2, zoom),
                                tileParams = '',
                                backendTileApi = 'http://96.126.97.48/layers/api/tile/',
//                                backendTileApi = 'http://127.0.0.1:5003/layers/api/tile/',
                                tileurl = null;                                

                            if (!normalizedCoord) {
                                return null;
                            }              
                            tileParams = tileParams + 'key_name=' + keyName;
                            tileParams = tileParams + '&source=' + layerSource;
                            tileParams = tileParams + '&r=' + color.getRed(),
                            tileParams = tileParams + '&g=' + color.getGreen(),
                            tileParams = tileParams + '&b=' + color.getBlue(),
                            tileParams = tileParams + '&x=' + normalizedCoord.x;
                            tileParams = tileParams + '&y=' + normalizedCoord.y;
                            tileParams = tileParams + '&z=' + zoom;      
                            if (zoom < 9){
                                tileurl = "/data/tile?" + tileParams;
                            } else {
                                tileurl = backendTileApi + layerType + "?" + tileParams;
                            }
                            mol.log.info(tileurl);
                            return tileurl;
                        },
                        tileSize: new google.maps.Size(256, 256),
                        isPng: true,
                        opacity: 0.5,
                        name: keyName
                    });
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

    /**
     * The Map Engine.
     */
    mol.ui.Map.Engine = mol.ui.Engine.extend(
        {
            /**
             * Constucts a new Map Engine.
             *
             * @param api the mol.ajax.Api for server communication
             * @param bus the mol.events.Bus for event handling 
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
             * @param container the container for the engine display 
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
             * @param place the place to go
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
                    ColorEvent = mol.events.ColorEvent,
                    layers = this._layers,
                    self = this;
                
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
                            colorEventConfig = {},
                            bounds = new google.maps.LatLngBounds();
                                                
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
                    //background: new Image(),
                    foreground: new Image(),
                    error: new Image()
                };
                //this._iconLayers.background.src = "/static/maps/placemarks/placemark-background.png";
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
             * @param display - the mol.ui.Display to add
             * @param position - the mol.ui.Map.Control.DisplayPosition
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
     * The Map Display. It's basically a Google map attached to the 'map' div 
     * in the <body> element.
     */
    mol.ui.Map.Display = mol.ui.Display.extend(
        {

            /**
             * Constructs a new Map Display.
             * 
             * @param config the display configuration
             * @constructor
             */
            init: function(config) {
                var mapOptions = {
                    zoom: 2,
                    maxZoom: 15,
                    mapTypeControlOptions: {position: google.maps.ControlPosition.BOTTOM_LEFT},
                    center: new google.maps.LatLng(0,0),
                    mapTypeId: google.maps.MapTypeId.TERRAIN
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
