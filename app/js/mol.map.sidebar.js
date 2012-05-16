mol.modules.map.sidebar = function(mol) {

    mol.map.sidebar = {};

    mol.map.sidebar.SidebarEngine = mol.mvp.Engine.extend(
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
                this.display = new mol.map.sidebar.SidebarDisplay();
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

                this.display.about.click(
                    function(Event) {
                        window.open('/about/');
                    }
                );


                this.display.help.click(
                    function(Event) {
                        self.bus.fireEvent(
                            new mol.bus.Event('help-display-dialog')
                        );
                    }
                );

                this.display.status.click(
                    function(Event) {
                        self.bus.fireEvent(
                            new mol.bus.Event('status-display-dialog')
                        );
                    }
                );

                this.display.feedback.click(
                    function(Event) {
                        self.bus.fireEvent(
                            new mol.bus.Event('feedback-display-toggle')
                        );
                    }
                );

                this.display.share.click(
                    function(Event) {
                        var addthis_url = 'http://api.addthis.com/oexchange/0.8/offer?' +
                            'url=' + encodeURI('http://www.mappinglife.org') + 
                            '&title=' + encodeURI('Map of Life') +
                            '&description=' + encodeURI("By bringing together all types of information about species distributions, providing model-based integration, and providing a system for users to build upon our knowledge, the Map of Life project hopes to support our community in understanding and saving the world's biodiversity.") +
                            '&pubid=' + encodeURI('ra-4fb3099b2f56aff1')

                        window.open(addthis_url, 'addthis_share', 'height=300,width=500,toolbar=no,scrollbars=yes');
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
                        position: google.maps.ControlPosition.LEFT_CENTER
                    },
                    event = new mol.bus.Event('add-map-control', params);

                this.bus.fireEvent(event);
            }
        }
    );
     mol.map.sidebar.SidebarDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                    '<div class="mol-Sidebar">' +
                    '    <div title="Current known issues." class="widgetTheme status button"><img src="/static/buttons/status_fr.png"></div>' +
                    '    <div title="About the Map of Life Project." class="widgetTheme about button"><img src="/static/buttons/about_fr.png"></div>' +
                    '    <div title="Share our application" class="widgetTheme share button addthis_toolbox"><img src="/static/buttons/status_fr.png"></div>' +
                    '    <div title="Submit feedback." class="widgetTheme feedback button"><img src="/static/buttons/feedback_fr_2.png"></div>' +
                    '    <div title="Get help." class="widgetTheme help button"><img src="/static/buttons/help_fr.png"></div>' +
                    '</div>';

                this._super(html);
                this.about = $(this).find('.about');
                this.help = $(this).find('.help');
                this.feedback = $(this).find('.feedback');
                this.status = $(this).find('.status');
                this.share = $(this).find('.share');
            }
        }
    );
};

