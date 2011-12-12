/**
 * Allow customly add layers with information like username and tablename
 */
MOL.modules.Add = function(mol) {
	mol.ui.Add = {};
	
	mol.ui.Add.Display = mol.ui.Display.extend(
		{
			init: function(config) {
                this._super(this._html());
			},
			getUserNameInput: function() {
				var x = this._usernameInput,
                s = '#username';
				return x ? x : (this.usernameInput = this.findChild(s));
			},
			getDomainInput: function() {
				var x = this._domainInput,
                s = '#domain';
				return x ? x : (this.domainInput = this.findChild(s));
			},
			getTableNameInput: function() {
				var x = this._tablenameInput,
                s = '#tablename';
				return x ? x : (this.tablenameInput = this.findChild(s));
			},
			getQueryInput: function() {
				var x = this._queryInput,
                s = '#query';
				return x ? x : (this.queryInput= this.findChild(s));
			},
			getCloseButton: function(){
                var x = this._closeButton,
                    s = '.cancel';
                return x ? x : (this._closeButton = this.findChild(s));
            },
            getGoButton: function() {
                var x = this._goButton,
                    s = '.execute';
                return x ? x : (this._goButton = this.findChild(s));
            },
            clearAll: function() {
            	this.getUserNameInput().val(new String());
            	this.getDomainInput().val(new String());
            	this.getTableNameInput().val(new String());
            	this.getQueryInput().val(new String());
            },
			_html: function() {
				return	'<div class="mol-LayerControl-Add widgetTheme">' + 
		                '  <div class="title" style="width:100%; display:block; padding-bottom:5px; font-size: 20px;">Add:</div>' + 
		                '  <div class="key">Username</div>' + 
		                '  <input id="username" class="value" type="text" placeholder="username e.g. eighty">' + 
		                '  <div class="key">Domain</div>' + 
		                '  <input id="domain" class="value" placeholder="domain e.g. cartodb.com:80">' +
		                '  <div class="key">Table</div>' + 
		                '  <input id="tablename" class="value" placeholder="tablename e.g. mol_cody">' +
		                '  <div class="key">Query</div>' + 
		                '  <input id="query" class="value" placeholder="query e.g. select *">' +
		                '  <button class="execute">Add</button>' +
		                '  <button class="cancel"><img src="/static/maps/search/cancel.png" ></button>' + 
		                '</div>';
		                /*
		                '<div class="mol-LayerControl-Results">' + 
		                '  <div class="filters">' + 
		                '  </div>' + 
		                '  <div class="searchResults widgetTheme">' + 
		                '    <div class="resultHeader">' +
		                '       Results' +
		                '       <a href="" class="selectNone">none</a>' +
		                '       <a href="" class="selectAll">all</a>' +
		                '    </div>' + 
		                '    <ol class="resultList"></ol>' + 
		                '    <div class="pageNavigation">' + 
		                '       <button class="addAll">Map Selected Layers</button>' + 
		                '    </div>' + 
		                '  </div>' + 
		                '</div>';
		                */
			}
		}
	);
	
	/**
	 * The add engine
	 */
	mol.ui.Add.Engine = mol.ui.Engine.extend(
        {
        	/**
             * Constructs the engine.
             * 
             * @constructor
             */
            init: function(api, bus) {
                this._api = api;
                this._bus = bus;
            },
            
            /**
             * Starts the engine by creating and binding the display.
             *
             * @override mol.ui.Engine.start
             */
            start: function(container) {
                var text = {
                	table: 'Table name',
                	user: 'Username'
                };
                this._bindDisplay(new mol.ui.Add.Display(), text);
            },

            /**
             * Gives the engine a new place to go based on a browser history
             * change.
             * 
             * @override mol.ui.Engine.go
             */
            go: function(place) {
            	
            },
            
            /**
             * Binds the display.
             */
            _bindDisplay: function(display, text) {
            	var widget = null,
            		result = null,
            		self = this;
            	
                this._display = display;
                display.setEngine(this);
                
                this._addLayerControlEventHandler();
                
                display.hide();
                
                // Close button:
                widget = display.getCloseButton();
                widget.click(
                    function(event) {
                        display.hide();
                        display.clearAll();
                    }
                );
                
                // Go button
                widget = display.getGoButton();
                //widget.text(text.go);
                widget.click(
                	function(event) {
                		self._onGoButtonClick();
                	}
                );
                
                this._addDisplayToMap();
            },
            
            /**
             * Fires a MapControlEvent so that the display is attached to
             * the map as a control in the TOP_LEFT position.
             */
            _addDisplayToMap: function() {
                var MapControlEvent = mol.events.MapControlEvent,
                    display = this._display,
                    bus = this._bus,
                    DisplayPosition = mol.ui.Map.Control.DisplayPosition,
                    ControlPosition = mol.ui.Map.Control.ControlPosition,
                    action = 'add',
                    config = {
                        display: display,
                        action: action,
                        displayPosition: DisplayPosition.TOP,
                        controlPosition: ControlPosition.TOP_LEFT
                    };
                bus.fireEvent(new MapControlEvent(config));     
            },
            
            /**
             * Adds an event handler for LayerControlEvent events so that a
             * 'add-click' action will show the search display as a control
             * on the map.
             */
            _addLayerControlEventHandler: function() {
                var display = this._display,
                    bus = this._bus,
                    LayerControlEvent = mol.events.LayerControlEvent;
                
                bus.addHandler(
                    LayerControlEvent.TYPE,
                    function(event) {
                        var action = event.getAction(),
                            displayNotVisible = !display.isVisible();               
                        
                        if (action === 'add-click' && displayNotVisible) {
                            display.show();
                        }
                    }
                );
            },
            
            _onGoButtonClick: function() {
            	var username = this._display.getUserNameInput().val(),
            		tablename = this._display.getTableNameInput().val(),
            		query = this._display.getQueryInput().val();
            	if (username.length > 0 && tablename.length > 0) {
            		alert(username+'.moldb.io/'+tablename+ '/'+query);
            	} else {
            		alert('Please fill in both username and tablename');
            	}
            },
            
            
        }
    );
}