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
                        "AND provider = 'birds1000m'";

        },
        start : function() {
            this.addQueryDisplay();
            this.addEventHandlers();
        },
        /*
         *  Build the loading display and add it as a control to the top center of the map display.
         */
        addQueryDisplay : function() {
        //putting this in the menu for now
      /*           var params = {
                   display: null, // The loader gif display
                   slot: mol.map.ControlDisplay.Slot.TOP,
                   position: google.maps.ControlPosition.TOP_RIGHT
                };
                this.display = new mol.map.QueryDisplay();
                params.display = this.display;
                this.bus.fireEvent(new mol.bus.Event('add-map-control', params));
       */
                this.bus.fireEvent(new mol.bus.Event('register-list-click'));
                this.toolEnabled=false;
        },
        getList: function(lat, lng, radius, marker) {
                var self = this,
                    sql = this.sql.format((lat+' '+lng), radius),
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
                    var params = {
                                display: null,
                                slot: mol.map.ControlDisplay.Slot.BOTTOM,
                                position: google.maps.ControlPosition.TOP_RIGHT
                        };
                    if(self.toolEnabled) {
                        //get rid of the old circle, if there was one
                        if(self.listradius) {
                            self.listradius.setMap(null);
                        }
                        self.listradius =  new google.maps.Circle({
                            map: event.map,
                            radius: 50000, // 50 km
                            center: event.gmaps_event.latLng
                        });
                        if(!self.resultsdisplay) {
                           self.resultsdisplay = new mol.map.QueryResultsListDisplay();
                           params.display = self.resultsdisplay;
                           self.bus.fireEvent(new mol.bus.Event('add-map-control', params));
                        } else {
                            $(self.resultsdisplay.resultslist).html('');
                            $(self.resultsdisplay.loading).show();
                        }
                        self.bus.fireEvent( new mol.bus.Event('layer-display-toggle'),{visible : false});
                        self.bus.fireEvent( new mol.bus.Event('search-display-toggle'),{visible : false});
                        self.getList(event.gmaps_event.latLng.lat(),event.gmaps_event.latLng.lng(),self.listradius.radius, self.listradius);
                    }
                 }
            );
             this.bus.addHandler(
                'species-list-query-results',
                function (event) {

                    if(!event.response.error&&self.toolEnabled) {

                        $(self.resultsdisplay.loading).hide();
                        //fill in the results
                        $(self.resultsdisplay.resultslist).html('');
                        _.each(
                            event.response.rows,
                            function(name) {
                                var result = new mol.map.QueryResultDisplay(name.scientificname);
                                self.resultsdisplay.resultslist.append(result);
                            }
                        )
                    } else {
                        //TODO
                    }
                }
             );

            this.bus.addHandler(
                'species-list-tool-toggle',
                function(event) {
                    self.toolEnabled = event.toggle;
                    if(self.toolEnabled == false) {
                        self.listradius.setMap(null);
                        $(self.resultsdisplay).remove();
                        self.resultsdisplay = null;
                    } else {
                        self.bus.fireEvent( new mol.bus.Event('layer-display-toggle'),{visible: false});
                        self.bus.fireEvent( new mol.bus.Event('search-display-toggle'),{visible: false});
                    }
                }
            );
        }
    }
    );

    /*
     *  Display for a loading indicator.
     *  Use jQuery hide() and show() to turn it off and on.
     */
    mol.map.QueryDisplay = mol.mvp.View.extend(
    {
        init : function() {
            var className = 'mol-Map-QueryDisplay',
                html = '' +
                        '<div class="' + className + ' widgetTheme">' +
                        '   <div><input type="checkbox" class="list" name="queryclicktype" value="list">Species List Tool (50km)</div>' +
                        '</div>';
            this._super(html);
            this.speciesListTool = $(this).find('.list');

        }
    }
    );
    mol.map.QueryResultsListDisplay = mol.mvp.View.extend(
    {
        init : function(names) {
            var className = 'mol-Map-QueryResultsListDisplay',
                html = '' +
                        '<div class="' + className + ' widgetTheme">' +
                        '   <div class="loading">' +
                        '       <img src="static/loading.gif">' +
                        '   </div>' +
                        '   <div  class="resultslist"></div>'
                        '</div>',

            this._super(html);
            this.resultslist=$(this.find('.resultslist'));
            this.loading=$(this.find('.loading'));
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
