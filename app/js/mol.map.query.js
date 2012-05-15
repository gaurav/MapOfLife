mol.modules.map.query = function(mol) {

    mol.map.query = {};

    mol.map.query.QueryEngine = mol.mvp.Engine.extend(
    {
        init : function(proxy, bus, map) {
                this.proxy = proxy;
                this.bus = bus;
                this.map = map;
                this.sql = "" +
                        "SELECT DISTINCT "+
                        "   p.scientificname as scientificname, "+
                        "   t.common_names_eng as english, "+
                        "   initcap(lower(t._order)) as order, " +
                        "   initcap(lower(t.Family)) as family, " +
                        "   t.red_list_status as redlist, " +
                        "   initcap(lower(t.class)) as className, " +
                        "   dt.title as type_title, " +
                        "   pv.title as provider_title, " +
                        "   dt.type as type, " +
                        "   pv.provider as provider, " +
                        "   t.year_assessed as year_assessed, " +
                        "   s.sequenceid as sequenceid " +
                        "FROM {3} p " +
                        "LEFT JOIN synonym_metadata n " +
                        "ON p.scientificname = n.scientificname " +
                        "LEFT JOIN (SELECT scientificname, " +
                        "                  replace(initcap(string_agg(common_names_eng, ',')),'''S','''s')  as common_names_eng, " + //using string_agg in case there are duplicates
                        "                  MIN(class) as class, " + //these should be the same, even if there are duplicates
                        "                  MIN(_order) as _order, " +
                        "                  MIN(family) as family, " +
                        "                  string_agg(red_list_status,',') as red_list_status, " +
                        "                  string_agg(year_assessed,',') as year_assessed " +
                        "           FROM master_taxonomy " +
                        "           GROUP BY scientificname ) t " +
                        "ON (p.scientificname = t.scientificname OR n.mol_scientificname = t.scientificname) " +
                        "LEFT JOIN sequence_metadata s " +
                        "   ON t.family = s.family " +
                        "LEFT JOIN types dt ON " +
                        "   p.type = dt.type " +
                        "LEFT JOIN providers pv ON " +
                        "   p.provider = pv.provider " +
                        "WHERE " +
                        "   ST_DWithin(p.the_geom_webmercator,ST_Transform(ST_PointFromText('POINT({0})',4326),3857),{1}) " + //radius test
                        "   {2} " + //other constraints
                        "ORDER BY s.sequenceid, p.scientificname asc";

        },
        start : function() {
            this.addQueryDisplay();
            this.addEventHandlers();
        },
        /*
         *  Build the loading display and add it as a control to the top center of the map display.
         */
        addQueryDisplay : function() {
                var params = {
                    display: null,
                    slot: mol.map.ControlDisplay.Slot.BOTTOM,
                    position: google.maps.ControlPosition.RIGHT_BOTTOM
                 };
                this.bus.fireEvent(new mol.bus.Event('register-list-click'));
                this.enabled=true;
                this.features={};
                this.display = new mol.map.QueryDisplay();
                params.display = this.display;
                this.bus.fireEvent( new mol.bus.Event('add-map-control', params));
        },
        getList: function(lat, lng, listradius, constraints, className) {
                var self = this,
                    sql = this.sql.format((lng+' '+lat), listradius.radius, constraints, 'polygons'),
                    params = {sql:sql, key: '{0}'.format((lat+'-'+lng+'-'+listradius.radius+constraints))},
                    action = new mol.services.Action('cartodb-sql-query', params),
                    success = function(action, response) {
                        var results = {listradius:listradius,  constraints: constraints, className : className, response:response},
                        event = new mol.bus.Event('species-list-query-results', results);
                        self.bus.fireEvent(event);
                    },
                    failure = function(action, response) {

                    };

                this.proxy.execute(action, new mol.services.Callback(success, failure));

        },
        addEventHandlers : function () {
            var self = this;
            _.each(
                $('button',$(this.display.types)),
                function(button) {
                    $(button).click(
                        function(event) {
                            $('button',$(self.display.types)).removeClass('selected');
                            $(this).addClass('selected');
                            if($(this).hasClass('range')&&self.display.classInput.val().toLowerCase().indexOf('reptil')>0) {
                                alert('Available for North America only.');
                            }
                        }
                    )
                }
            );
            /*
             * Handler in case other modules want to switch the query tool
             */
            this.bus.addHandler(
                'query-type-toggle',
                function (params) {
                    var e = {
                        params : params
                    };
                    self.changeTool(e);
                }
            );
            this.bus.addHandler(
                'species-list-query-click',
                function (event) {
                    var listradius,
                        constraints = $(self.display.classInput).val() + $(".selected", $(self.display.types)).val(),
                        className =  $("option:selected", $(self.display.classInput)).text();

                    if (self.enabled) {
                        listradius = new google.maps.Circle(
                            {
                                map: event.map,
                                radius: parseInt(self.display.radiusInput.val())*1000, // 50 km
                                center: event.gmaps_event.latLng,
                                strokeWeight: 0,
                                clickable:false
                            }
                        );
                        self.bus.fireEvent( new mol.bus.Event('show-loading-indicator', {source : 'listradius'}));
                        self.getList(event.gmaps_event.latLng.lat(),event.gmaps_event.latLng.lng(),listradius, constraints, className);
                    }
                 }
            );
             this.bus.addHandler(
                'species-list-query-results',
                function (event) {
                    var content,
                        className,
                        listradius  = event.listradius,
                        tablerows = [],
                        providers = [],
                        scientificnames = {},
                        years = [],
                        infoWindow,
                        latHem,
                        lngHem,
                        height,
                        redlistCt = {},
                        speciestotal = 0,
                        speciesthreatened = 0,
                        speciesdd = 0;

                    if(!event.response.error) {
                        className = event.className;
                        latHem = (listradius.center.lat() > 0) ? 'N' : 'S';
                        lngHem = (listradius.center.lng() > 0) ? 'E' : 'W';
                       _.each(
                           event.response.rows,
                            function(row) {
                                    var english = (row.english != null) ? _.uniq(row.english.split(',')).join(',') : '',
                                        year = (row.year_assessed != null) ? _.uniq(row.year_assessed.split(',')).join(',') : '',
                                        redlist = (row.redlist != null) ? _.uniq(row.redlist.split(',')).join(',') : '';

                                    tablerows.push("<tr><td><button value='"+row.scientificname+"'>map</button></td>" +
                                        "<td class='wiki'>" +
                                        row.scientificname + "</td><td class='wiki english'>" +
                                        ((english != null) ? english : '') + "</td><td class='wiki'>" +
                                        ((row.order != null) ? row.order : '')+ "</td><td class='wiki'>" +
                                        ((row.family != null) ? row.family : '')+ "</td><td>" +
                                        ((row.sequenceid != null) ? row.sequenceid : '')+ "</td><td class='iucn' data-scientificname='"+row.scientificname+"'>" +
                                        ((redlist != null) ? redlist : '') + "</td></tr>");
                                        providers.push('<a class="type {0}">{1}</a>, <a class="provider {2}">{3}</a>'.format(row.type,row.type_title,row.provider,row.provider_title));
                                    if (year != null && year != '') {
                                        years.push(year)
                                    }
                                    scientificnames[row.scientificname]=redlist;
                            }
                        );
                        years = _.uniq(years);
                        tablerows = _.uniq(tablerows);
                        providers = _.uniq(providers);

                        years = _.sortBy(_.uniq(years), function(val) {return val});
                        years[years.length-1] = (years.length > 1) ? ' and '+years[years.length-1] : years[years.length-1];

                        _.each(
                            scientificnames,
                            function(red_list_status) {
                                speciestotal++;
                                speciesthreatened += ((red_list_status.indexOf('RN')>=0) || (red_list_status.indexOf('VU')>=0) || (red_list_status.indexOf('CR')>=0) )  ? 1 : 0;
                                speciesdd += (red_list_status.indexOf('DD')>0)  ? 1 : 0;
                            }
                        )

                        height = (90 + 22*speciestotal < 300) ? 90 + 22*speciestotal : 300;

                        stats = (speciesthreatened > 0) ? ('('+speciesthreatened+' considered threatened by <a href="http://www.iucnredlist.org" target="_iucn">IUCN</a> '+years.join(',')+')') : '';

                        if(speciestotal>0) {
                            content=$('<div class="mol-Map-ListQueryInfoWindow" style="height:'+ height+'px">' +
                                    '   <div>' +
                                    '       <b>' +
                                            className +
                                    '       </b>' +
                                            listradius.radius/1000 + ' km around ' +
                                            Math.abs(Math.round(listradius.center.lat()*1000)/1000) + '&deg;&nbsp;' + latHem + '&nbsp;' +
                                            Math.abs(Math.round(listradius.center.lng()*1000)/1000) + '&deg;&nbsp;' + lngHem + ':<br>' +
                                            speciestotal + ' '+
                                            stats +
                                           '<br>' +
                                           'Data type/source:&nbsp;' + providers.join(', ') + '.&nbsp;All&nbsp;seasonalities.' +
                                    '   </div> ' +
                                    '   <div> ' +
                                    '       <table class="tablesorter">' +
                                    '           <thead><tr><th></th><th>Scientific Name</th><th>English Name</th><th>Order</th><th>Family</th><th>Rank&nbsp;&nbsp;&nbsp;</th><th>IUCN&nbsp;&nbsp;</th></tr></thead>' +
                                    '           <tbody class="tablebody">' +
                                                    tablerows.join('') +
                                    '           </tbody>' +
                                    '       </table>' +
                                    '   </div>' +
                                    '</div>');
                        } else {
                            content = $('<div class="mol-Map-ListQueryEmptyInfoWindow">' +
                                    '       <b>' +
                                    '        No ' + className.replace(/All/g, '') + ' species found within ' +
                                            listradius.radius/1000 + ' km of ' +
                                            Math.abs(Math.round(listradius.center.lat()*1000)/1000) + '&deg;&nbsp;' + latHem + '&nbsp;' +
                                            Math.abs(Math.round(listradius.center.lng()*1000)/1000) + '&deg;&nbsp;' + lngHem +
                                    '       </b>' +
                                    '   </div>');
                        }

                        infoWindow= new google.maps.InfoWindow( {
                            content: content[0],
                            position: listradius.center,
                            height: height+100
                        });

                        self.features[listradius.center.toString()+listradius.radius] = {
                             listradius : listradius,
                             infoWindow : infoWindow
                        };

                        google.maps.event.addListener(
                            infoWindow,
                            "closeclick",
                            function (event) {
                                listradius.setMap(null);
                                delete(self.features[listradius.center.toString()+listradius.radius]);
                            }
                         );
                         self.features[listradius.center.toString()+listradius.radius] = {
                             listradius : listradius,
                             infoWindow : infoWindow
                         };

                        infoWindow.open(self.map);
                        //infoWindow.setSize(new google.maps.Size(height+200), 650)
                        $(".tablesorter", $(infoWindow.content)
                         ).tablesorter({ headers: { 0: { sorter: false}}, widthFixed: true}
                         );

                         _.each(
                             $('button',$(infoWindow.content)),
                             function(button) {
                                 $(button).click(
                                     function(event) {
                                        self.bus.fireEvent(new mol.bus.Event('search',{term:$(button).val()}));
                                    }
                                 );
                             }
                         );
                         _.each(
                             $('.wiki',$(infoWindow.content)),
                             function(wiki) {
                                 $(wiki).click(
                                     function(event) {
                                        var win = window.open('http://en.wikipedia.com/wiki/'+$(this).text().split(',')[0].replace(/ /g, '_'));
                                        win.focus();
                                    }
                                 );
                             }
                         );
                         _.each(
                             $('.iucn',$(infoWindow.content)),
                             function(iucn) {
                                 if($(iucn).data('scientificname')!='') {
                                    $(iucn).click(
                                         function(event) {
                                            var win = window.open('http://www.iucnredlist.org/apps/redlist/search/external?text='+$(this).data('scientificname'));
                                            win.focus();
                                        }
                                    );
                                 }
                             }
                         );
                        } else {
                            listradius.setMap(null);
                            delete(self.features[listradius.center.toString()+listradius.radius]);
                        }

                    self.bus.fireEvent( new mol.bus.Event('hide-loading-indicator', {source : 'listradius'}));

                }
             );

            this.bus.addHandler(
                'species-list-tool-toggle',
                function(event) {
                    self.enabled = !self.enabled;
                    if (self.listradius) {
                            self.listradius.setMap(null);
                        }
                    if(self.enabled == true) {
                        $(self.display).show();
                        _.each(
                            self.features,
                            function(feature) {
                                feature.listradius.setMap(self.map);
                                feature.infoWindow.setMap(self.map);
                            }
                        );
                    } else {
                        $(self.display).hide();
                        _.each(
                            self.features,
                            function(feature) {
                                feature.listradius.setMap(null);
                                feature.infoWindow.setMap(null);
                            }
                        );
                   }
                }
            );
            this.display.radiusInput.blur(
                function(event) {
                    if(this.value>1000) {
                        this.value=1000;
                        alert('Please choose a radius between 50 km and 1000 km.');
                    }
                    if(this.value<50) {
                        this.value=50;
                        alert('Please choose a radius between 50 km and 1000 km.');
                    }
                }
            );
            this.display.classInput.change(
                function(event) {
                    if($(this).val().toLowerCase().indexOf('fish')>0) {
                        $(self.display.types).find('.ecoregion').toggle(false);
                        $(self.display.types).find('.ecoregion').removeClass('selected');
                        if($(self.display.types).find('.range').hasClass('selected')) {
                           alert('Available for North America only.');
                        };

                    } else if($(this).val().toLowerCase().indexOf('reptil')>0) {
                        $(self.display.types).find('.ecoregion').toggle(true);
                        $(self.display.types).find('.ecoregion').removeClass('selected');
                        //$(self.display.types).find('.range').addClass('selected');
                        if($(self.display.types).find('.range').hasClass('selected')) {
                            alert('Available for North America only.');
                        };
                    } else {
                        $(self.display.types).find('.ecoregion').toggle(false);
                        $(self.display.types).find('.range').toggle(true);
                        $(self.display.types).find('.range').addClass('selected');
                    }

                }
            )
        }
    }
    );

    mol.map.QueryDisplay = mol.mvp.View.extend(
    {
        init : function(names) {
            var className = 'mol-Map-QueryDisplay',
                html = '' +
                        '<div title="Use this control to select species group and radius. Then right click (Mac Users: \'control-click\') on focal location on map." class="' + className + ' widgetTheme">' +
                        '   <div class="controls">' +
                        '     Search Radius <select class="radius">' +
                        '       <option selected value="50">50 km</option>' +
                        '       <option value="100">100 km</option>' +
                        '       <option value="500">500 km</option>' +
                        '       <option value="1000">1000 km</option>' +
                        '     </select>' +
                        '     Group <select class="class" value="">' +
                        '       <option selected value=" AND  p.polygonres = 1000 ">Birds</option>' +
                        '       <option value=" AND p.provider = \'fishes\' ">NA Freshwater Fishes</option>' +
                        '       <option value=" AND p.class=\'reptilia\' ">Reptiles</option>' +
                        '       <option value=" AND p.class=\'amphibia\' ">Amphibians</option>' +
                        '       <option value=" AND p.class=\'mammalia\' ">Mammals</option>' +
                        '     </select>' +
                        '      <span class="types">' +
                        '           <button class="range selected" value=" AND p.type=\'range\'"><img title="Click to use Expert range maps for query." src="/static/maps/search/range.png"></button>' +
                        '           <button class="ecoregion" value=" AND p.type=\'ecoregion\' "><img title="Click to use Regional checklists for query." src="/static/maps/search/ecoregion.png"></button>' +
                        '       </span>'+
                        '   </div>' +
                        '</div>';

            this._super(html);
            this.resultslist=$(this).find('.resultslist');
            this.radiusInput=$(this).find('.radius');
            this.classInput=$(this).find('.class');
            this.types=$(this).find('.types');
            $(this.types).find('.ecoregion').toggle(false);
        }
    }
    );
    mol.map.QueryResultDisplay = mol.mvp.View.extend(
    {
        init : function(scientificname) {
            var className = 'mol-Map-QueryResultDisplay',
                 html = '{0}';
            this._super(html.format(scientificname));

        }
    }
    );
};
