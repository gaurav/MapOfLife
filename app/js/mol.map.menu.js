mol.modules.map.menu = function(mol) {

    mol.map.menu = {};

    mol.map.menu.MenuEngine = mol.mvp.Engine.extend(
        {
            init: function(proxy, bus) {
                this.proxy = proxy;
                this.bus = bus;
            },

            /**
             * Starts the MenuEngine. Note that the container parameter is
             * ignored.
             */
            start: function() {
                this.display = new mol.map.menu.MenuDisplay();
                this.display.toggle(true);
                this.addEventHandlers();
                this.fireEvents();
            },

            /**
             * Adds a handler for the 'search-display-toggle' event which
             * controls display visibility. Also adds UI event handlers for the
             * display.
             */
            addEventHandlers: function() {
                var self = this;

                this.display.dashboardItem.click(
                    function(event) {
                        self.bus.fireEvent(
                            new mol.bus.Event('taxonomy-dashboard-toggle'));
                    }
                );

                this.display.helpButton.click(
                    function(Event) {
                        self.bus.fireEvent(
                            new mol.bus.Event('help-display-dialog')
                        );
                    }
                ); 

                this.display.searchItem.click(
                    function(event) {
                        self.bus.fireEvent(
                            new mol.bus.Event('search-display-toggle'));
                    }
                );
                this.display.legendItem.click(
                    function(event) {
                        self.bus.fireEvent(
                            new mol.bus.Event('legend-display-toggle'));
                    }
                );
                this.display.speciesListItem.click(
                    function(event) {
                        self.bus.fireEvent(new mol.bus.Event('species-list-tool-toggle'));
                    }
                );
                this.display.layersToggle.click(
                    function(event) {
                        if(self.display.layersToggle[0].src.indexOf('collapse.png')>0)  {
                            self.bus.fireEvent(new mol.bus.Event('layer-display-toggle',{visible : false}));
                            self.display.layersToggle[0].src = '/static/maps/layers/expand.png';
                        } else {
                            self.bus.fireEvent(new mol.bus.Event('layer-display-toggle',{visible : true}));
                            self.display.layersToggle[0].src = '/static/maps/layers/collapse.png';
                        }
                    }
                );

                this.bus.addHandler(
                    'hide-layer-display-toggle',
                    function(event) {
                        self.display.layersToggle[0].style.visibility="hidden";
                    }
                );
                this.bus.addHandler(
                    'show-layer-display-toggle',
                    function(event) {
                        self.display.layersToggle[0].style.visibility="visible";
                    }
                );
                this.bus.addHandler(
                    'menu-display-toggle',
                    function(event) {
                        var params = null,
                        e = null;

                        if (event.visible === undefined) {
                            self.display.toggle();
                            params = {visible: self.display.is(':visible')};
                        } else {
                            self.display.toggle(event.visible);
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
                        slot: mol.map.ControlDisplay.Slot.FIRST,
                        position: google.maps.ControlPosition.TOP_RIGHT
                    },
                    event = new mol.bus.Event('add-map-control', params);

                this.bus.fireEvent(event);
            }
        }
    );

    mol.map.menu.MenuDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                    '<div class="mol-LayerControl-Menu ">' +
                    '    <div class="label">' +
                    '       <img class="layersToggle" src="/static/maps/layers/collapse.png">' +
                    '    </div>' +
                    '    <div title="Toggle layer search tools." id="search" class="widgetTheme search button">Search</div>' +
                    '    <div title="Toggle map legend." id="legend" class="widgetTheme legend button">Legend</div>' +
                    '    <div title="Toggle species list radius tool (right-click to use)" id="list" class="widgetTheme legend button">Species&nbsp;Lists</div>' +
                    '</div>';

                this._super(html);
                this.searchItem = $(this).find('#search');
                this.legendItem = $(this).find('#legend');
                this.speciesListItem = $(this).find('#list');
                this.layersToggle = $(this).find('.layersToggle');

                this.dashboardItem = $('#dashboard_toggle');
                this.helpButton = $('#help_toggle');
            }
        }
    );
};



