mol.modules.map.search = function(mol) {

    mol.map.search = {};

    mol.map.search.SearchEngine = mol.mvp.Engine.extend(
        {
            /**
             * @param bus mol.bus.Bus
             */
            init: function(proxy, bus) {
                this.proxy = proxy;
                this.bus = bus;
                this.searching = {};
                this.names = [];
                this.sql = '' +
                    'SELECT ' +
                    '   s.provider as source, ' +
                    '   p.title as source_title, ' +
                    '   p.sourcetype as sourcetype, ' +
                    '   s.scientificname as name, ' +
                    '   s.type as type, ' +
                    '   t.title as type_title, ' +
                    '   n.name as names, ' +
                    '   n.class as _class, ' +
                    '   m.records as feature_count ' +
                    'FROM  layer_metadata s ' +
                    'LEFT JOIN ( ' +
                    '   SELECT ' +
                    '   scientific, initcap(lower(array_to_string(array_sort(array_agg(common_names_eng)),\', \'))) as name, class ' +
                    '   FROM master_taxonomy ' +
                    '   GROUP BY scientific, class HAVING scientific = \'{0}\' ' +
                    ') n '+
                    'ON s.scientificname = n.scientific ' +
                    'LEFT JOIN (' +
                    '   ( SELECT ' +
                    '       count(*) as records, ' +
                    '       \'points\' as type, ' +
                    '       \'gbif\' as provider ' +
                    '   FROM' +
                    '       gbif_import ' +
                    '   WHERE ' +
                    '       lower(scientificname) = lower(\'{0}\'))' +
                    '   UNION ALL ' +
                    '   (SELECT ' +
                    '       count(*) as records, ' +
                    '       type, ' +
                    '       provider ' +
                    '   FROM ' +
                    '       polygons' +
                    '   GROUP BY ' +
                    '       scientificname, type, provider ' +
                    '   HAVING ' +
                    '       scientificname = \'{0}\' )' +
                    ') m ' +
                    'ON ' +
                    '   s.type = m.type AND s.provider = m.provider ' +
                    'LEFT JOIN ' +
                    '   types t ' +
                    'ON ' +
                    '   s.type = t.type ' +
                    'LEFT JOIN ' +
                    '   providers p ' +
                    'ON ' +
                    '   s.provider = p.provider ' +
                    'WHERE s.scientificname = \'{0}\' ';
            },

            /**
             * Starts the SearchEngine. Note that the container parameter is
             * ignored.
             */
            start: function() {
                this.display = new mol.map.search.SearchDisplay();
                this.display.toggle(true);
                this.initAutocomplete();
                this.addEventHandlers();
                this.fireEvents();
            },
            /*
             * Initialize autocomplate functionality
             */
            initAutocomplete: function() {
                this.populateAutocomplete(null, null);

                // http://stackoverflow.com/questions/2435964/jqueryui-how-can-i-custom-format-the-autocomplete-plug-in-results
                $.ui.autocomplete.prototype._renderItem = function (ul, item) {

                    item.label = item.label.replace(
                        new RegExp("(?![^&;]+;)(?!<[^<>]*)(" +
                                   $.ui.autocomplete.escapeRegex(this.term) +
                                   ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<strong>$1</strong>");
                    return $("<li></li>")
                        .data("item.autocomplete", item)
                        .append("<a>" + item.label + "</a>")
                        .appendTo(ul);
                };
            },

            /*
             * Populate autocomplete results list
             */
            populateAutocomplete : function(action, response) {
				var self = this;
                $(this.display.searchBox).autocomplete(
                    {
                        minLength: 3, // Note: Auto-complete indexes are min length 3.
                        source: function(request, response) {
                            $.post(
                                'cache/get',
                                {
                                    key: 'ac-sql-{0}'.format(request.term),
                                    sql:"SELECT n,v from ac where n~*'\\m{0}' OR v~*'\\m{0}'".format(request.term)
                                },
                                function (json) {
                                    var names = [],scinames=[];
                                    _.each (
                                        json.rows,
                                        function(row) {
                                            var sci, eng;
                                            if(row.n != undefined){
                                                   sci = row.n;
                                                   eng = (row.v == null)? '' : ', {0}'.format(row.v.replace(/'S/g, "'s"));
                                                   names.push({label:'<span class="sci">{0}</span><span class="eng">{1}</span>'.format(sci, eng), value:sci});
                                                   scinames.push(sci)

                                           }
                                       }
                                    );
                                    if(scinames.length>0) {
                                        self.names=scinames;
                                    }
                                    response(names);
                                    self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator', {source : "autocomplete"}));
                                 },
                                 'json'
                            );
                        },
                        select: function(event, ui) {
                            self.searching[ui.item.value] = false;
                            self.names = [ui.item.value];
                            self.search(ui.item.value);
                        },
                        close: function(event,ui) {

                        },
                        search: function(event, ui) {
                            self.searching[$(this).val()] = true;
                            self.names=[];
                            self.bus.fireEvent(new mol.bus.Event('show-loading-indicator', {source : "autocomplete"}));
                        },
                        open: function(event, ui) {
                            self.searching[$(this).val()] = false;
                            self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator', {source : "autocomplete"}));
                        }
                  });
            },

            addEventHandlers: function() {
                var self = this;

                /**
                 * Callback that toggles the search display visibility. The
                 * event is expected to have the following properties:
                 *
                 *   event.visible - true to show the display, false to hide it.
                 *
                 * @param event mol.bus.Event
                 */
                this.bus.addHandler(
                    'search-display-toggle',
                    function(event) {
                        var params = {},
                            e = null;

                        if (event.visible === undefined) {
                            self.display.toggle();
                            params = {visible: self.display.is(':visible')};
                        } else {
                            self.display.toggle(event.visible);
                        }

                        e = new mol.bus.Event('results-display-toggle', params);
                        self.bus.fireEvent(e);
                    }
                );
                
                this.bus.addHandler(
                    'close-autocomplete',
                    function(event) {
                        $(self.display.searchBox).autocomplete("close");
                    }
                );
                
                this.bus.addHandler(
                    'search',
                    function(event) {
                        if (event.term != undefined) {
                            if (!self.display.is(':visible')) {
                                self.bus.fireEvent(new mol.bus.Event('search-display-toggle',{visible : true}));
                            }

                            self.search(event.term);

                            if (self.display.searchBox.val()=='') {
                                self.display.searchBox.val(event.term);
                            }
                        }
                   }
                );
                
                /**
                 * Clicking the go button executes a search.
                 */
                this.display.goButton.click(
                    function(event) {
						      self.search(self.names.join(","));
                    }
                );

                /**
                 * Clicking the cancel button hides the search display and fires
                 * a cancel-search event on the bus.
                 */
                this.display.cancelButton.click(
                    function(event) {
                        var params = {
                            visible: false
                        };

                        self.display.toggle(false);
                        self.bus.fireEvent(
                            new mol.bus.Event('results-display-toggle', params));
                    }
                );

                /**
                 * Pressing the return button clicks the go button.
                 */
                this.display.searchBox.keyup(
                    function(event) {
                        if (event.keyCode === 13) {
                            $(this).autocomplete("close");
                            self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator', {source : "autocomplete"}));
                            //user hit return before autocomplete got a result.
                            if (self.searching[$(this).val()] == undefined || self.searching[$(this).val()]) {
                                $(self.display.searchBox).one(
                                    "autocompleteopen",
                                    function(event, ui) {
                                        var term = self.names.join(",");
                                        self.searching[$(this).val()] = false;
                                        self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator', {source : "autocomplete"}));
                                        $(self.display.searchBox).autocomplete("close");
                                        self.search(term);
                                }
                             );
                            $(this).autocomplete("search",$(this).val());
                        } else if (self.names.length>0 && !self.searching[$(this).val()]) {
                                var term = self.names.join(",");
                                $(self.display.searchBox).autocomplete("close");
                                self.search(term);
                            }
                        }
                    }
                );
            },

            /**
             * Fires the 'add-map-control' event. The mol.map.MapEngine handles
             * this event and adds the display to the map.
             */
            fireEvents: function() {
                var params = {
                        display: this.display,
                        slot: mol.map.ControlDisplay.Slot.TOP,
                        position: google.maps.ControlPosition.TOP_LEFT
                    },
                    event = new mol.bus.Event('add-map-control', params);

                this.bus.fireEvent(event);
            },

            /**
             * Searches CartoDB via proxy using a term from the search box. Fires
             * a search event on the bus. The success callback fires a search-results
             * event on the bus.
             *
             * @param term the search term (scientific name)
             */
            search: function(term) {
                var self = this;
                    self.bus.fireEvent(new mol.bus.Event('show-loading-indicator', {source : "search".format(term)}));
                    self.bus.fireEvent(new mol.bus.Event('results-display-toggle',{visible : false}));
                    $(self.display.searchBox).autocomplete('disable');
                    $(self.display.searchBox).autocomplete('enable');
                
                // Update count for term.
                $.post(
                    'cartodb/results/count',
                    {
                        name: self.display.searchBox.val()
                    },
                    function (response) {
                        // NO-OP
                    }
                );
                
                $.post(
                    'cartodb/results',
                                {
                                    names:term
                                },
                                function (response) {
                                    var results = {term:term, response:response};
                                    self.bus.fireEvent(new mol.bus.Event('hide-loading-indicator', {source : "search".format(term)}));
                                    self.bus.fireEvent(new mol.bus.Event('search-results', results));
                                },
                                'json'
                            );

            }
        }
    );

    mol.map.search.SearchDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                    '<div class="mol-LayerControl-Search widgetTheme">' +
                    '    <div class="title ui-autocomplete-input">Search:</div>' +
                    '    <input class="value" type="text" placeholder="Search by name">' +
                    '    <button class="execute">Go</button>' +
                    '    <button class="cancel">&nbsp;</button>' +
                    '</div>';

                this._super(html);
                this.goButton = $(this).find('.execute');
                this.cancelButton = $(this).find('.cancel');
                this.searchBox = $(this).find('.value');
            },

            clear: function() {
                this.searchBox.html('');
            }
        }
    );
};
