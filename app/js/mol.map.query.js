mol.modules.map.query = function(mol) {

    mol.map.query = {};

    mol.map.query.QueryEngine = mol.mvp.Engine.extend(
    {
        init : function(proxy, bus, map) {
                this.proxy = proxy;
                this.bus = bus;
                this.map = map;
                this.sql = "" +
                        "SET STATEMENT_TIMEOUT TO 0;" +
                        "SELECT DISTINCT scientificname " +
                        "FROM polygons_new " +
                        "WHERE ST_DWithin(the_geom_webmercator,ST_Transform(ST_PointFromText('POINT({0})',4326),3857),{1}) " +
                        //"WHERE ST_DWithin(the_geom,ST_PointFromText('POINT({0})',4326),0.1) " +
                        "AND provider = 'Jetz' AND polygonres = '1000' ORDER BY scientificname";

        },
        start : function() {
            this.addQueryDisplay();
            this.addEventHandlers();
        },
        /*
         *  Build the loading display and add it as a control to the top center of the map display.
         */
        addQueryDisplay : function() {
                this.bus.fireEvent(new mol.bus.Event('register-list-click'));
                this.enabled=false;
                  var params = {
                                display: null,
                                slot: mol.map.ControlDisplay.Slot.BOTTOM,
                                position: google.maps.ControlPosition.TOP_RIGHT
                        };
                this.display = new mol.map.QueryDisplay();
                params.display = this.display;
                this.bus.fireEvent( new mol.bus.Event('add-map-control', params));
        },
        getList: function(lat, lng, radius, marker) {
                var self = this,
                    sql = this.sql.format((lng+' '+lat), radius),
                    params = {sql:sql, key: '{0}'.format((lat+'-'+lng+'-'+radius))},
                    action = new mol.services.Action('cartodb-sql-query', params),
                    success = function(action, response) {
                        var results = {marker:marker, response:response},
                        event = new mol.bus.Event('species-list-query-results', results);
                        self.bus.fireEvent(event);
                    },
                    failure = function(action, response) {

                    };
                this.proxy.execute(action, new mol.services.Callback(success, failure));

        },
        addEventHandlers : function () {
            var self = this;
            /*
             * Handler in case other modules want to switch the query tool
             */
            this.bus.addHandler(
                'query-type-toggle',
                function (params) {
                    var e = {
                        params : params
                    }
                    self.changeTool(e);
                }
            );
            this.bus.addHandler(
                'species-list-query-click',
                function (event) {

                    if(self.enabled) {
                        //get rid of the old circle, if there was one
                        if(self.listradius) {
                            self.listradius.setMap(null);
                        }
                        self.listradius =  new google.maps.Circle({
                            map: event.map,
                            radius: parseInt(self.display.radiusInput.val())*1000, // 50 km
                            center: event.gmaps_event.latLng
                        });


                        $(self.display.resultslist).html('Searching for species...');

                        self.bus.fireEvent( new mol.bus.Event('layer-display-toggle', {visible : false}));
                        //self.bus.fireEvent( new mol.bus.Event('search-display-toggle', {visible : false}));
                        self.bus.fireEvent( new mol.bus.Event('show-loading-indicator', {source : 'listradius'}));
                        self.getList(event.gmaps_event.latLng.lat(),event.gmaps_event.latLng.lng(),self.listradius.radius, self.listradius);
                    }
                 }
            );
             this.bus.addHandler(
                'species-list-query-results',
                function (event) {
                    self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator', {source : 'listradius'}));
                    if(!event.response.error&&self.enabled) {

                        //fill in the results
                        $(self.display.resultslist).html('');
                        self.display.resultslist.html(
                                event.response.total_rows +
                                ' species found within ' +
                                self.listradius.radius/1000 + ' km of<br> ' +
                                Math.round(self.listradius.center.lat()*1000)/1000 + '&deg; Latitude ' +
                                Math.round(self.listradius.center.lng()*1000)/1000 + '&deg; Longitude '
                         );
                        _.each(
                            event.response.rows,
                            function(name) {
                                var result = new mol.map.QueryResultDisplay(name.scientificname);
                                self.display.resultslist.append(result);
                            }
                        )
                        $(self.resultsdisplay).show();
                    } else {
                        //TODO -- What if nothing comes back?
                    }
                }
             );

            this.bus.addHandler(
                'species-list-tool-toggle',
                function(event) {
                    self.enabled = !self.enabled;
                    if(self.enabled == true) {
                        if (self.listradius) {
                            self.listradius.setMap(null);
                        }
                        $(self.display).show();
                        self.bus.fireEvent( new mol.bus.Event('layer-display-toggle',{visible: false}));
                        //self.bus.fireEvent( new mol.bus.Event('search-display-toggle',{visible: true}));
                    } else {
                        $(self.display).hide();
                        self.bus.fireEvent( new mol.bus.Event('layer-display-toggle',{visible: true}));
                        //self.bus.fireEvent( new mol.bus.Event('search-display-toggle',{visible: false}));
                    }
                }
            );
            this.display.radiusInput.keyup(
                function(event) {
                    if(this.value>1000) {
                        this.value=1000;
                    }
                }
            );
        }
    }
    );

    mol.map.QueryDisplay = mol.mvp.View.extend(
    {
        init : function(names) {
            var className = 'mol-Map-QueryResultsListDisplay',
                html = '' +
                        '<div class="' + className + ' widgetTheme">' +
                        '   <div class="controls">' +
                        '     Search Radius (km) <input type="text" class="radius" size="5" value="50">' +
                        '     Class <select class="class" value="Birds">' +
                        '       <option value="aves">Birds</option>' +
                        '       <option disabled value="osteichthyes">Fish</option>' +
                        '       <option disabled value="reptilia">Reptiles</option>' +
                        '       <option disabled value="amphibia">Amphibians</option>' +
                        '       <option disabled value="mammalia">Mammals</option>' +
                        '     </select>' +
                        '   </div>' +
                        '   <div class="resultslist">Click on the map to find bird species within 50km of that point.</div>' +
                        '</div>';

            this._super(html);
            this.resultslist=$(this.find('.resultslist'));
            this.radiusInput=$(this.find('.radius'));
            $(this.radiusInput).numeric({negative : false, decimal : false});
            this.classInput=$(this.find('.class'));
            $(this).hide();
        }
    }
    );
    mol.map.QueryResultDisplay = mol.mvp.View.extend(
    {
        init : function(scientificname) {
            var className = 'mol-Map-QueryResultDisplay',
                html = '<div class="' + className + '">{0}</div>';
            this._super(html.format(scientificname));

        }
    }
    );
}
