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
                this.sql = '' +
                    'SET STATEMENT_TIMEOUT TO 0; ' + // Secret konami workaround for 40 second timeout.
                    'SELECT ' +
                    'p.provider as source, p.scientificname as name, p.type as type ' +
                    'FROM polygons as p ' +
                    'WHERE p.scientificname = \'{0}\' ' +
                    'UNION SELECT ' +
                    't.provider as source, t.scientificname as name, t.type as type ' +
                    'FROM points as t ' +
                    'WHERE t.scientificname = \'{1}\'';
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
                this.populateAutocomplete(null,null); 
            },

            /*
             * Populate autocomplete results list
             */
            populateAutocomplete : function(action, response) {
                $(this.display.searchBox).autocomplete(
                    {
                        RegEx: '\\b<term>[^\\b]*', //<term> gets replaced by the search term.
                        minLength: 3,
                        delay: 0,
                        source: function(request, response) {
                            // TODO: Refactor this using our proxy:
                            $.getJSON(
                                'api/autocomplete',
                                {
                                    key: request.term
                                },
                                function(names) {
                                    response(names);
                                }
                            );
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
                        var params = null,
                            e = null;

                        if (event.visible === undefined) {
                            self.display.toggle();
                            params = {visible: self.display.is(':visible')};
                        } else {
                            self.display.toggle(event.visible);
                        }
						params.visible = false;
                        e = new mol.bus.Event('results-display-toggle', params);
                        self.bus.fireEvent(e);
                    }
                );
                
                /**
                 * Clicking the go button executes a search.
                 */
                this.display.goButton.click(
                    function(event) {
						      self.search(self.display.searchBox.val());
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
                        self.display.goButton.click();
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
                var self = this,
                    sql = this.sql.format(term, term),
                    params = {sql:sql, key: 'name-{0}'.format(term)},
                    action = new mol.services.Action('cartodb-sql-query', params),
                    success = function(action, response) {
                        var results = {term:term, response:response},
                            event = new mol.bus.Event('search-results', results);
                        self.display.loading.hide();
                        self.bus.fireEvent(event);
                    },
                    failure = function(action, response) {
                        self.display.loading.hide();
                    };

                this.display.loading.show();
                this.proxy.execute(action, new mol.services.Callback(success, failure));
                this.bus.fireEvent('search', new mol.bus.Event('search', term));
            }
        }
    );

    mol.map.search.SearchDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                    '<div class="mol-LayerControl-Search">' +
                    '  <div class="searchContainer widgetTheme">' +
                    '    <div class="title ui-autocomplete-input"">Search:</div>' +
                    '    <input class="value" type="text" placeholder="Search by name">' +
                    '    <button class="execute">Go</button>' +
                    '    <button class="cancel">' +
                    '      <img src="/static/maps/search/cancel.png">' +
                    '    </button>' +
                    '  </div>' +
                    '  <img class="loading" src="/static/loading.gif">' +
                    '</div>';

                this._super(html);
                this.goButton = $(this.find('.execute'));
                this.cancelButton = $(this.find('.cancel'));
                this.searchBox = $(this.find('.value'));
                this.loading = $(this.find('.loading'));
            },

            clear: function() {
                this.searchBox.html('');
            }
        }
    );
};
