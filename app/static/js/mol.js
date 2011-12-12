/**
 * Copyright 2010 Andrew W. Hill, Aaron Steele
 * 
 * 
 * This is the global MOL constructor for creating a sandbox environment composed
 * of modules. Everything that happens within this constructor is protected from
 * leaking into the global scope.
 * 
 */
function MOL() {
    var args = Array.prototype.slice.call(arguments),
        callback = args.pop(),
        modules = (args[0] && typeof args[0] === "string") ? args : args[0],
        i;
    if (!(this instanceof MOL)) {
        return new MOL(modules, callback);
    }
   
    if (!modules || modules === '*') {
        modules = [];
        for (i in MOL.modules) {
            if (MOL.modules.hasOwnProperty(i)) {
                modules.push(i);
            }
        }
    }
    for (i = 0; i < modules.length; i += 1) {
        MOL.modules[modules[i]](this);
    }
    callback(this);
    return this;
};

MOL.modules = {};
















/**
 * App module for running the app with a given configuration.
 */
MOL.modules.app = function(mol) {

    mol.app = {};

    mol.app.Instance = Class.extend(
        {
            init: function(config) {
                mol.log.enabled = config ? config.logging: false;
                this._control = new mol.location.Control(config);
                Backbone.history.start();
            },

            run: function() {
                mol.log.info('App is now running!');
            },
            
            getBus: function() {
                return this._control.getBus();
            }
        }
    );
};
/**
 * Events module for working with application events. Contains a Bus object that
 * is used to bind event handlers and to trigger events.
 */
MOL.modules.events = function(mol) {
    mol.events = {};
    
    /**
     * Base class for events. Events can be fired on the event bus.
     */
    mol.events.Event = Class.extend(
        {
            /**
             * Constructs a new event.
             * 
             * @param type the type of event
             */
            init: function(type, action) {
                var IllegalArgumentException = mol.exceptions.IllegalArgumentException;
                if (!type) {
                    throw IllegalArgumentException;
                }
                this._type = type;
                this._action = action;
            },

            /**
             * Gets the event type.
             * 
             * @return the event type string
             */
            getType: function() {
                return this._type;
            },

            /**
             * Gets the action.
             * 
             * @return action
             */
            getAction: function() {
                return this._action;
            }            
        }
    );

    /**
     * Place event.
     */
    mol.events.LocationEvent = mol.events.Event.extend(
        {
            init: function(location, action, refresh) {
                this._super('LocationEvent', action);
                this._location = location;
                this._refresh = refresh;
            },

            getRefresh: function() {                
                return this._refresh;
            },

            getLocation: function() {
                return this._location;
            }
        }
    );
    mol.events.LocationEvent.TYPE = 'LocationEvent';

    /**
     * Event for colors.
     */
    mol.events.ColorEvent = mol.events.Event.extend(
        {
            init: function(config) {
                this._super('ColorEvent', config.action);
                this._color = config.color;
                this._category = config.category;
                this._id = config.id;
            },
            
            getColor: function() {
                return this._color;
            },
            
            getCategory: function() {
                return this._category;
            },

            getId: function() {
                return this._id;
            }            
        }
    );
    mol.events.ColorEvent.TYPE = 'ColorEvent';

    /**
     * Event for layers.
     */
    mol.events.LayerEvent = mol.events.Event.extend(
        {

            init: function(config) {
                this._super('LayerEvent', config.action);
                this._layer = config.layer;
                this._zoomLayerIds = config.zoomLayerIds;
            },

            getLayer: function() {
                return this._layer;
            },


            getZoomLayerIds: function() {
                return this._zoomLayerIds;
            }
        }
    );
    mol.events.LayerEvent.TYPE = 'LayerEvent';

    /**
     * Trigger this event if you generate layer control actions such as 'Add' 
     * or 'Delete'.
     * 
     * Supported actions:
     *     add-click
     *     delete-click   
     */
    mol.events.LayerControlEvent = mol.events.Event.extend(
        {
            init: function(action, layerId, zoomLayerIds) {
                this._super('LayerControlEvent', action);
                this._layerId = layerId;
            },
            
            getLayerId: function() {
                return this._layerId;
            }
        }
    );
    mol.events.LayerControlEvent.TYPE = 'LayerControlEvent';

    /**
     * Trigger this event to add a map control widget on the map at a position.
     */
    mol.events.MapControlEvent = mol.events.Event.extend(
        {
            /**
             * Constructs a new MapControlEvent object.
             * 
             * @constructor
             * 
             * @param div - the div element of the display to add to map control
             * @param controlPosition - mol.ui.Map.Control.ControlPosition
             * @param displayPosition - mol.ui.Map.Control.DisplayPosition
             * @param action - the action (add, remove)
             */
            init: function(config) {
                this._super('MapControlEvent');
                this._display = config.display;
                this._controlPosition = config.controlPosition;
                this._displayPosition = config.displayPosition;
                this._action = config.action;
            },
            
            /**
             * Gets the widget.
             * 
             * @return widget
             */
            getDisplay: function() {
                return this._display;
            },

            /**
             * Gets the control position.
             * 
             * @return controlPosition
             */
            getControlPosition: function() {
                return this._controlPosition;
            },

            /**
             * Gets the display position within the control.
             */
            getDisplayPosition: function() {
                return this._displayPosition;                
            },

            /**
             * Gets the action.
             * 
             * @return action
             */
            getAction: function() {
                return this._action;
            }
        }
    );
    mol.events.MapControlEvent.TYPE = 'MapControlEvent';

    
    // Event types:
    mol.events.ADD_MAP_CONTROL = 'add_map_control';

    mol.events.NEW_LAYER = 'new_layer';
    mol.events.DELETE_LAYER = 'delete_layer';
//    mol.events.SET_LAYER_COLOR = 'set_layer_color';
    mol.events.GET_NEXT_COLOR = 'get_next_color';
    mol.events.NEXT_COLOR = 'next_color';
    mol.events.COLOR_CHANGE = 'color_change';
    
    /**
     * The event bus.
     */
    mol.events.Bus = function() {
        if (!(this instanceof mol.events.Bus)) {
            return new mol.events.Bus();
        }
        _.extend(this, Backbone.Events);

        /**
         * Fires an event on the event bus.
         * 
         * @param event the event to fire
         */
        this.fireEvent = function(event) {
            this.trigger(event.getType(), event);
        };

        /**
         * Adds an event handler for an event type.
         * 
         * @param type the event type
         * @param handler the event handler callback function
         */
        this.addHandler = function(type, handler) {
            this.bind(
                type, 
                function(event) {
                    handler(event);
                }
            );
        };
        return this;
    };
};
/**
 * AJAX module for communicating with the server. Contains an Api object that 
 * can be used to execute requests paired with success and failure callbacks.
 */
MOL.modules.ajax = function(mol) {
    mol.ajax = {};
    
    /**
     * Action.
     */
    mol.ajax.Action = Class.extend(
        {
            init: function(name, type, params) {
                this.name = name;
                this.type = type;
                this.params = params || {};
            },
            
            toJson: function() {
                return JSON.stringify(this);
            },

            getName: function() {
                return this.name;
            },
            
            getType: function() {
                return this.type;
            },

            getParams: function() {
                return this.params;
            }
        }
    );

    /**
     * ActionCallback.
     */
    mol.ajax.ActionCallback = Class.extend(
        {
            init: function(success, failure) {
                this._success = success;
                this._failure = failure;
            },

            /**
             * @param error - the mol.exceptions.Error that caused failure
             */
            onFailure: function(error) {
                this._failure(error);
            },
            
            /**
             * @param actionResponse - the mol.ajax.ActionResponse for the action
             */
            onSuccess: function(actionResponse) {
                this._success(actionResponse);
            }
        }
    );

    
    /**
     * The layer action.
     */
    mol.ajax.LayerAction = mol.ajax.Action.extend(
        {
            /**
             * @param type - the action type (only 'search' for now)
             */
            init: function(type, params) {
                console.log(type);
                console.log(params);
                this._super('LayerAction', type, params);                
            }
        }
    );
    


    /**
     * The AJAX API.
     */
    mol.ajax.Api = Class.extend(
        {
            /**
             * Constructs a new Api object with an event bus.
             * 
             * @param bus mol.events.Bus
             * @constructor
             */
            init: function(bus) {
                this._bus = bus;
            },
            
            /**
             * Executes an action asynchronously.
             * 
             * @param action the mol.ajax.Action
             * @param callback the mol.ajax. ActionCallback
             */
            execute: function(action, callback ) {
                var params = {action: action.toJson()},
                    xhr = $.post('/webapp', params, 'json'),
                    self = this;

                xhr.success(
                    function(response) {
                        callback.onSuccess(response);
                        self.fireEvents(action);
                    }
                );

                xhr.error(
                    function(error) {
                        callback.onFailure(error);
                    }
                );
            },

            fireEvents: function(action) {
                var bus = this._bus,
                    actionName = action.getName(),
                    actionType = action.getType();

                switch (actionName) {

                case 'LayerAction':
                    switch (actionType) {

                    case 'search':
                        mol.log.todo('Fire LayerEvent');                        
                    }
                }                        
            }
        }
    );    
};

/**
 * Logging module that writes log messages to the console and to the Speed 
 * Tracer API. It contains convenience methods for info(), warn(), error(),
 * and todo().
 * 
 */
MOL.modules.log = function(mol) {    
    mol.log = {};

    mol.log.info = function(msg) {
        mol.log._write('INFO: ' + msg);
    };

    mol.log.warn = function(msg) {
        mol.log._write('WARN: ' + msg);
    };

    mol.log.error = function(msg) {
        mol.log._write('ERROR: ' + msg);
    };

    mol.log.todo = function(msg) {
        mol.log._write('TODO: '+ msg);
    };

    mol.log._write = function(msg) {
        var logger = window.console;
        if (mol.log.enabled) {
            if (logger && logger.markTimeline) {
                logger.markTimeline(msg);
            }
            console.log(msg);
        }
    };
};
/**
 * Exceptions module for handling exceptions.
 */
MOL.modules.exceptions = function(mol) {
    mol.exceptions = {};
    
    mol.exceptions.Error = Class.extend(
        {
            init: function(msg) {
                this._msg = msg;
            },

            getMessage: function() {
                return this._msg;
            }
        }
    );

    mol.exceptions.NotImplementedError = mol.exceptions.Error.extend(
    );

    mol.exceptions.IllegalArgumentException = mol.exceptions.Error.extend(
    );
};
/**
 * Copyright 2011 Andrew W. Hill, Aaron Steele
 * 
 * Location module for handling browser history and routing. Contains a Control
 * object used to initialize and start application ui modules and dispatch 
 * browser location changes.
 */
MOL.modules.location = function(mol) {
    mol.location = {};

    mol.location.Control = Backbone.Controller.extend(
        {
            initialize: function(config) {
                this._bus = config.bus || new mol.events.Bus();
                this._api = config.api || new mol.ajax.Api(this._bus);

                this._addLocationHandler();

                this._colorSetter = new mol.ui.ColorSetter.Api({'bus': this._bus});
                this._container = $('body');

                this._mapEngine = new mol.ui.Map.Engine(this._api, this._bus);
                this._colorSetter = new mol.ui.ColorSetter.Api({'bus': this._bus});
                
                this._mapEngine.start(this._container);

                this._layerControlEngine = new mol.ui.LayerControl.Engine(this._api, this._bus);
                this._layerControlEngine.start(this._container);                

                this._searchEngine = new mol.ui.Search.Engine(this._api, this._bus);
                this._searchEngine.start(this._container);
                
                this._metadataEngine = new mol.ui.Metadata.Engine(this._api, this._bus);
                this._metadataEngine.start(this._container);
            },

            getBus: function() {
                return this._bus;
            },
            
            _addLocationHandler: function() {
                var bus = this._bus,
                    LocationEvent = mol.events.LocationEvent,
                    self = this;
                
                bus.addHandler(
                    LocationEvent.TYPE,
                    function(event) {
                        var mapState = '',
                            searchState = '',
                            layerState = '',
                            url = window.location.href,
                            action = event.getAction(),
                            refresh = event.getRefresh(),
                            mapEngine = self._mapEngine,
                            searchEngine = self._searchEngine,
                            layerControlEngine = self._layerControlEngine;

                        switch (action) {
                        case 'get-url':
                            mapState = mol.util.urlEncode(mapEngine.getPlaceState());
                            searchState = mol.util.urlEncode(searchEngine.getPlaceState());
                            layerState = mol.util.urlEncode(layerControlEngine.getPlaceState());
                            url = url + '#' + mapState + '&' + searchState + '&' + layerState;
                            if (refresh) {
                                self.sandbox(mapState + '&' + searchState + '&' + layerState);
                                return;
                            }
                            bus.fireEvent(new LocationEvent({url: url}, 'take-url'));
                            break;
                        }
                    }
                );
                
            },
            
            routes: {
                ":sandbox": "sandbox"
            },
            
            sandbox: function(query) {
                mol.log.info(query);
                var place = mol.util.urlDecode(query);
                this._mapEngine.go(place);
                this._searchEngine.go(place);
                this._layerControlEngine.go(place);
            }
        }
    );
};
/**
 * Model module.
 */
MOL.modules.model = function(mol) {
  
    mol.model = {};

    mol.model.Model = Class.extend(
        {           
            init: function(props) {
                this._props = props;
            },

            get: function(name) {
                return this._props[name];
            },

            toJson: function() {
                return JSON.stringify(this._props);
            }
        }
    );

    mol.model.LayerSource = mol.model.Model.extend(
        {
            init: function(props) {
                this._super(props);
            },

            getId: function() {
                return this.get('id');
            },

            getNames: function() {
                return this.get('names');
            },

            getTypes: function() {
                return this._get('types');
            }
        }
    );

	mol.model.RGBA = Class.extend({
		init: function() {
			this.r = 134;
			this.g = 32;
			this.b = 128;
			this.a = 0.7;
		},
		update: function(rgb, alpha) {
			if (rgb) {
				this.r = rgb.r;
				this.g = rgb.g;
				this.b = rgb.b;
			}
			if (alpha) {
				this.a = alpha;
			}
		},
		toString: function() {
			return "rgba("+this.r+","+this.g+","+this.b+","+this.a+")";
		}
	});

	mol.model.Style = Class.extend({
		init: function() {
			this.properties = {
				'polygon-fill': new mol.model.RGBA(),
				'line-color': new mol.model.RGBA()
			};
		},
		setFill: function(rgb, alpha) {
			this.updateProperty('polygon-fill', rgb, alpha);
		},
		setStroke: function(rgb, alpha) {
			this.updateProperty('line-color', rgb, alpha);
		},
		getFill: function() {
			return this.properties['polygon-fill'];
		},
		getStroke: function() {
			return this.properties['line-color'];
		},
		updateProperty: function(tag, rgb, alpha) {
			this.properties[tag].update(rgb, alpha);
		},
		toString: function() {
			result = "{";
			for (var property in this.properties) {
				result += property+"\:" + this.properties[property] + ";";
			}
			result += "}";
			return result;
		},
		toDisplayString: function() {
			result = "{\n";
			for (var property in this.properties) {
				result += "    "+property+"\:" + this.properties[property] + ";\n";
			}
			result += "}";
			return result;
		}
	});
    /**
     * The layer model.
     */
    mol.model.Layer = Class.extend(
        {
        	Config: function() {
        		this.user = 'eighty';
			    this.table = 'mol_cody';
			    this.host = 'cartodb.com'
			    this.columns = [];
			    this.debug = false;
			    this.style = new mol.model.Style();
        		this.getStyle = function() {
        			return this.style;
        		};
        		this.setStyle = function(style) {
        			this.style = style;
        		};
        	},
        	
            init: function(params) {
                this._id = [params.name, params.source, params.type].join('_');
                this._type = params.type;
                this._source = params.source;
                this._name = params.name;
                this._extent = params.extent;
                this._name2 = params.name2;
                this._key_name = params.key_name;
                this._json = params.json;
                this._info = params.info;
                this._color = null;
                this._icon = null;
                this._config = params.config || new this.Config();
            },
            
            getExtent: function() {
                return this._extent;                
            },

            getInfo: function() {
                return this._info;
            },

            hasPoints: function() {
                // TODO                
            },

            hasRange: function() {
                // TODO
            },

            getIcon: function() {
                return this._icon;
            },
            
            setIcon: function(icon) {
                this._icon = icon;
            },
            
            getType: function() {
                return this._type;                
            },

            getSource: function() {
                return this._source;
            },
            
            getName: function() {
                return this._name;                
            },
            
            getSubName: function() {
                return this._name2;                
            },

            getKeyName: function() {
                return this._key_name;                
            },
            
            getId: function() {
                return this._id;
            },
            
            getLid: function() {
                return this._key_name.split('/',2)[2];
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
};
/**
 * Utilities.
 */
MOL.modules.util = function(mol) {
    mol.util = {};
    
    mol.util.urlEncode = function(obj) {
        var str = [];
        for(var p in obj)
            str.push(p + "=" + encodeURIComponent(obj[p]));
        return str.join("&");
    };

    /**
     * Parses a URL encoded GET query string into a JavaScript object.
     * 
     * @param query The query string
     */
    mol.util.urlDecode = function(query) {
        var e,
        a = /\+/g,  
        r = /([^&=]+)=?([^&]*)/g,
        d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
        q = query.replace('#', '').replace('?', '');
        var urlParams = {};
        while ((e = r.exec(q))) {
            urlParams[d(e[1])] = d(e[2]);
        }
        return urlParams;
    };

};/**
 * UI module.
 */
MOL.modules.ui = function(mol) {
    
    mol.ui = {};
    
    /**
     * Interface for UI Engine classes.
     */
    mol.ui.Engine = Class.extend(
        {
            /**
             * Starts the engine and provides a container for its display.
             * 
             * @param container the container for the engine display 
             */
            start: function(container) {
                throw mol.exceptions.NotImplementedError;
            },
            
            /**
             * Gives the engine a new place to go based on a browser history
             * change.
             * 
             * @param place the place to go
             */
            go: function(place) {
                throw mol.exceptions.NotImplementedError;
            },
            
            /**
             * Gets an object of place state used to construct URL parameters.
             */
            getPlaceState: function() {
                throw mol.exceptions.NotImplementedError;
            }
        }
    );

    /**
     * Base class for DOM elements.
     */
    mol.ui.Element = Class.extend(
        {
            /**
             * Constructs a new Element from an element.
             */
            init: function(element) {
                if (!element) {
                    element = '<div>';
                }
                this._element = $(element);
            },
            
            /**
             * Returns the underlying DOM element object.
             */
            getElement: function() {
                return this._element;
            },
            
            /**
             * Proxies to JQuery.
             */
            change: function(handler) {
                this._element.change(handler);
            },
            
            attr: function(name, val) {
                if (val === undefined) {
                    return this._element.attr(name);
                } else {
                    return this._element.attr(name, val);                    
                }
            },

            /**
             * Proxies to JQuery to find parent element.
             */
            getParent: function(){
                return new mol.ui.Element(this._element.parent());
            },
            
            /**
             * Proxies to JQuery to find child element.
             */
            findChild: function(identfier){
                return new mol.ui.Element(this._element.find(identfier));
            },

            findChildren: function(id) {
                var res = new Array();
                this._element.children(id).each(function(c,v){
                    res.push(new mol.ui.Element(v));
                });
                return res;
            },
            

            find: function(id) {
                var res = new Array();
                this._element.find(id).each(function(c,v){
                    res.push(new mol.ui.Element(v));
                });
                return res;
            },
            
            text: function(text) {
                if (text) {
                    this._element.text(text);
                    return true;
                } else {
                    return this._element.text();
                }
            },

            select: function() {
                this._element.select();
            },
            
            src: function(src) {
                if (src) {
                    this._element.src = src;
                    return true;
                } else {
                    return this._element.src;
                }
            },

            /**
             * Proxies to JQuery.
             */
            val: function(val) {
                if (val) {
                    this._element.val(val);
                    return true;
                } else {
                    return this._element.val();    
                }                
            },
            
            /**
             * Proxies to JQuery.
             */
            setInnerHtml: function(html) {
                this._element.html(html);
            },

            /**
             * Proxies to JQuery.
             */
            getInnerHtml: function() {
                var html = this._element.html();
                return html;
            },

            /**
             * Proxies to JQuery.
             */
            isVisible: function() {
                if (!this._element.is(':visible')) {
                    return false;
                }
                return true;
            },

            setChecked: function(checked) {
                this.attr('checked', checked);
            },

            addClass: function(classname) {
                this._element.addClass(classname);
            },

            removeClass: function(classname) {
                this._element.removeClass(classname);                
            },

            isChecked: function() {
                if (!this._element.is(':checked')) {
                    return false;
                }
                return true;
            },
            
            /**
             * Proxies to JQuery UI.
             */
            disableSelection: function() {
                this._element.selectable({ disabled: true });
                return true;
            },

            /**
             * Proxies to JQuery.show()
             */
            show: function() {
                this._element.show();
            },
            
            /**
             * Proxies to JQuery.hide()
             */
            hide: function() {
                this._element.hide();                
            },

            /**
             * Proxy to JQuery.remove()
             */
            remove: function() {
                this._element.remove();
            },

            /**
             * Proxy to JQuery.click()
             */
            click: function(handler) {
                this._element.click(handler);
            },

            keyup: function(handler) {
                this._element.keyup(handler);
            },
            /**
             * Proxy to JQuery.append()
             */
            append: function(widget) {
                this._element.append(widget.getElement());
            },

            /**
             * Proxy to JQuery.prepend().
             */
            prepend: function(widget) {
                this._element.prepend(widget.getElement());
            },

            /**
             * Gets primary style name.
             */
            getStylePrimaryName: function() {
                var fullClassName = this.getStyleName(),
                    spaceIdx = fullClassName.indexOf(' ');
                if (spaceIdx >= 0) {
                    return fullClassName.substring(0, spaceIdx);
                }
                return fullClassName;
            },
            
            /**
             * Adds a secondary or dependent style name to this object.
             */
            addStyleName: function(style) {
                this._setStyleName(style, true);
            },
          
            /**
             * Adds a dependent style name by specifying the style name's suffix.
             */
            addStyleDependentName: function(styleSuffix) {
                this.addStyleName(this.getStylePrimaryName() + '-' + styleSuffix);
            },         

            focus: function() {
                this._element.focus();
            },
            
            fadeout: function(n) {
                var self = this;
                this._element.animate({opacity:0},3000,'swing', function(){self._element.remove()});
            },
            
            /**
             * Gets all of the object's style names, as a space-separated list.
             */
            getStyleName: function() {
                var classAttr = this.getElement().attr('class');
                if (!classAttr) {
                    return '';                    
                }
                return classAttr.split(/\s+/).join(' ');
            },
          
            /**
             * Clears all of the object's style names and sets it to the given 
             * style.
             */
            setStyleName: function(style) {
                var s = style.split(/\s+/).join(' ');
                this.getElement().attr('class', s);
            },

            /**
             * Removes a dependent style name by specifying the style name's 
             * suffix.
             */
            removeStyleDependentName: function(style) {
                 this.removeStyleName(this.getPrimaryStyleName() + '-' + style);
            },          

            /**
             * Removes a style.
             */
            removeStyleName: function(style) {
                this._setStyleName(style, false);
            },

            /**
             * Sets the object's primary style name and updates all dependent 
             * style names.
             */
            setStylePrimaryName: function(style) {
                style = $.trim(style);
                if (style.length == 0) {
                    throw mol.exceptions.IllegalArgumentException;
                }
                this._updatePrimaryAndDependentStyleNames(style);
            },

            _setStyleName: function(style, add) {
                var oldStyle, idx, last, lastPos, begin, end, newClassName;
                style = $.trim(style);
                if (style.length == 0) {
                    throw mol.exceptions.IllegalArgumentException;
                }

                // Get the current style string.
                oldStyle = this.getStyleName();
                idx = oldStyle.indexOf(style);

                // Calculate matching index.
                while (idx != -1) {
                    if (idx == 0 || oldStyle.charAt(idx - 1) == ' ') {
                        last = idx + style.length;
                        lastPos = oldStyle.length;
                        if ((last == lastPos)
                            || ((last < lastPos) && (oldStyle.charAt(last) == ' '))) {
                            break;
                        }
                    }
                    idx = oldStyle.indexOf(style, idx + 1);
                }

                if (add) {
                    // Only add the style if it's not already present.
                    if (idx == -1) {
                        if (oldStyle.length > 0) {
                            oldStyle += " ";
                        }
                        this.setStyleName(oldStyle + style);
                    }
                } else {
                    // Don't try to remove the style if it's not there.
                    if (idx != -1) {
                        // Get the leading and trailing parts, without the removed name.
                        begin = $.trim(oldStyle.substring(0, idx));
                        end = $.trim(oldStyle.substring(idx + style.length));

                        // Some contortions to make sure we don't leave extra spaces.
                        if (begin.length == 0) {
                            newClassName = end;
                        } else if (end.length == 0) {
                            newClassName = begin;
                        } else {
                            newClassName = begin + " " + end;
                        }
                        this.setStyleName(newClassName);
                    }
                }
            },

             /**
              * Replaces all instances of the primary style name.
              */
            _updatePrimaryAndDependentStyleNames: function(newPrimaryStyle) {
                var classes = this.getStyleName().split(/\s+/);
                if (!classes) {
                    return;
                }                
                var oldPrimaryStyle = classes[0];
                var oldPrimaryStyleLen = oldPrimaryStyle.length;
                var name;                
                classes[0] = newPrimaryStyle;
                for (var i = 1, n = classes.length; i < n; i++) {
                    name = classes[i];
                    if (name.length > oldPrimaryStyleLen
                        && name.charAt(oldPrimaryStyleLen) == '-'
                        && name.indexOf(oldPrimaryStyle) == 0) {
                        classes[i] = newPrimaryStyle + name.substring(oldPrimaryStyleLen);
                    }
                }
                this.setStyleName(classes.join(" "));
            }
        }
    );

    /**
     * Base class for Displays.
     */
    mol.ui.Display = mol.ui.Element.extend(
        {
            /**
             * Constructs a new Display with the given DOM element.
             */
            init: function(element) {
                this._super(element);
            },
            
            /**
             * Sets the engine for this display.
             * 
             * @param engine a mol.ui.Engine subclass
             */
            setEngine: function(engine) {
                this._engine = engine;
            }
        }
    );
};
/**
 * TODO: Andrew
 */
MOL.modules.ColorSetter = function(mol) {
    
    mol.ui.ColorSetter = {};
    
    mol.ui.ColorSetter.Color = Class.extend(
        {
            init: function(r, g, b) {
                this._r = r;
                this._g = g;
                this._b = b;
            },

            getRed: function() {
                return this._r;
            },
            
            getGreen: function() {
                return this._g;                
            },

            getBlue: function() {
                return this._b;
            },

            toString: function() {
                return 'Red=' + this._r + ', Green=' + this._g +', Blue=' + this._b;                    
            }
        }
    );

    mol.ui.ColorSetter.Api = Class.extend(
        {
            /**
             * @constructor
             */
            init: function(config) {
                this._bus = config.bus;
                this._types = {};
                this._bindEvents();
            },
            
            _bindEvents: function() {
                var bus = this._bus,
                    ColorEvent = mol.events.ColorEvent;
                
                bus.addHandler(
                    ColorEvent.TYPE,
                    function(event) {
                        var action = event.getAction(),
                            category = event.getCategory(),
                            id = event.getId(),
                            color = null,
                            config = {
                                action: 'change',
                                color: null,
                                category: category,
                                id: id
                            };
                        
                        switch (action) {
         
                        case 'get':
                            switch (category) {
                                
                            case 'points':
                                // TODO(andrew): Logic for getting next color.
                                config.color = new mol.ui.ColorSetter.Color(32, 40, 73);
                                break;

                            case 'range':
                                config.color = new mol.ui.ColorSetter.Color(183, 42, 16);
                                break;
                            case 'ecoregion':
                                config.color = new mol.ui.ColorSetter.Color(131, 209, 6);
                                break;
                            case 'pa':
                                config.color = new mol.ui.ColorSetter.Color(255, 191, 0);
                                break;
                            }                            
                            bus.fireEvent(new ColorEvent(config));
                        }                        
                    }
                );
            }
        }
    );
};
/**
 * LayerControl module that presents a map control for adding or deleting layers. 
 * It can handle app level events and perform AJAX calls to the server.
 * 
 * Event binding:
 *     None
 * 
 * Event triggering:
 *     ADD_LAYER - Triggered when the Add widget is clicked
 *     DELETE_LAYER - Triggered when the Delete widget is clicked
 */
MOL.modules.LayerControl = function(mol) {
    
    mol.ui.LayerControl = {};
    
    /**
     * The Layer engine.
     */
    mol.ui.LayerControl.Engine = mol.ui.Engine.extend(
        {
            /**
             * Constructs the engine.
             * 
             * @constructor
             */
            init: function(api, bus) {
                this._api = api;
                this._bus = bus;
                this._layerIds = {};
            },

            /**
             * Starts the engine by creating and binding the display.
             *
             * @override mol.ui.Engine.start
             */
            start: function(container) {
                this._bindDisplay(new mol.ui.LayerControl.Display());
            },

            /**
             * Gives the engine a new place to go based on a browser history
             * change.
             * 
             * @override mol.ui.Engine.go
             */
            go: function(place) {
                var visible = place.lv ? parseInt(place.lv) : 0,
                    display = this._display;
                
                display.toggleLayers(visible);
            },

            getPlaceState: function() {
                return {
                    lv: this._display.isLayersVisible() ? 1 : 0,
                    layers: _.keys(this._layerIds).join(',')
                };
            },
             
            /**
             * Binds the display.
             */
            _bindDisplay: function(display, text) {                
                var self = this,
                    LayerControlEvent = mol.events.LayerControlEvent,
                    LayerEvent = mol.events.LayerEvent,
                    widget = null,
                    bus = this._bus, 
                    ch = null,
                    styles = null,
                    layerId = null;


                this._display = display;
                display.setEngine(this);            
                
                // Clicking the layer button toggles the layer stack:
                widget = display.getLayerToggle();
                widget.click(
                    function(event) {
                        self._display.toggleLayers();
                    }
                );
                
                // Clicking the share button gets the shareable URL for the current view:
                widget = display.getShareButton();
                widget.click(
                    function(event) {
                        bus.fireEvent(new MOL.env.events.LocationEvent({}, 'get-url'));
                    }
                );
                
                bus.addHandler(
                  "LocationEvent", 
                  function(event){
                    if (event.getAction() == 'take-url') {
                        self._shareUrl = event.getLocation().url;
                        display.toggleShareLink(self._shareUrl);
                    }
                  }
                );                
                
                // Clicking the add button fires a LayerControlEvent:
                widget = display.getAddButton();
                widget.click(
                    function(event) {
                        bus.fireEvent(new LayerControlEvent('add-click'));
                        display.toggleShareLink("", false);
                        $(".mol-LayerControl-Search").find("input").focus();
                    }
                );

                // Zoom button click
                widget = display.getZoomButton();
                widget.click(
                    function(event) {
                        var styleNames = null,
                            zoomLayerIds = [],
                            e = null;
                        ch = $('.layer.widgetTheme.selected');
                        ch.each(
                            function(index) {
                                e = new mol.ui.Element(ch[index]);
                                styleNames = e.getStyleName().split(' ');
                                if (_.indexOf(styleNames, 'selected') > -1) {
                                    layerId = e.attr('id');
                                    if (!(layerId.indexOf('pa') !== -1) && !(layerId.indexOf('ecoregion') !== -1)) {
                                        zoomLayerIds.push(layerId);
                                    }
                                }                                 
                            }
                        );
                        _.delay(
                            function() {
                                bus.fireEvent(
                                    new LayerEvent(
                                        {
                                            action:'zoom', 
                                            layer: null,
                                            zoomLayerIds: zoomLayerIds
                                        }
                                    )
                                );
                            }, 200
                        );
                    }
                );

                // Clicking the delete button fires a LayerControlEvent:
                widget = display.getDeleteButton();
                widget.click(
                    function(event) {
                        var styleNames = null,
                            e = null;
                        ch = $('.layer.widgetTheme.selected');
                        ch.each(
                            function(index) {
                                e = new mol.ui.Element(ch[index]);
                                styleNames = e.getStyleName().split(' ');
                                if (_.indexOf(styleNames, 'selected') > -1) {
                                    layerId = e.attr('id');
                                    e.remove();
                                    bus.fireEvent(new LayerControlEvent('delete-click', layerId));
                                    delete self._layerIds[layerId];
                                    self._display.toggleShareLink("", false);
                                } 
                            });                                
                    }
                );
                
                this._addDisplayToMap();
                
                bus.addHandler(
                    LayerEvent.TYPE, 
                    function(event) {
                        var action = event.getAction(),
                            layer = event.getLayer(),
                            layerId = layer ? layer.getId() : null,
                            layerType = layer? layer.getType() : null,
                            layerName = layer ? layer.getName() : null,
                            layerSubName = layer ? layer.getSubName() : null,
                            layerIds = self._layerIds,
                            layerUi = null,
                            display = self._display,
                            LayerEvent = mol.events.LayerEvent,
                            ch = null,
                            toggle = null,
                            widget = null,
                            nullTest = null,
                            styleNames = null,
                            layerButton = null;
                    
                        switch (action) {                                                       
                            
                        case 'add':
                            if (layerIds[layerId]) {
                                // Duplicate layer.
                                return;
                            }
                            display.toggleLayers(true);
                            display.toggleShareLink("", false);
                            layerIds[layerId] = true;
                            layerUi = display.getNewLayer();
                            layerUi.getName().text(layerName);
                            layerUi.getType().attr("src","/static/maps/search/"+ layerType +".png");
                            layerButton = layerUi.getType();
                            layerButton.click(
                            	function(event) {
                            		var r = display.getNewStyleControl(layer),
                            		fillPalette = r.getFillPalette(),
                            		strokePalette = r.getStrokePalette(),
                            		fillSlider = r.getFillSlider(),
                            		strokeSlider = r.getStrokeSlider(),
                            		closeButton = r.getCloseButton(),
                            		updateButton = r.getUpdateStyleButton();
                            		
                            		fillPalette._element.ColorPicker(r._colorPaletteConfig('#fill'));
                            		strokePalette._element.ColorPicker(r._colorPaletteConfig('#line'));
                            		strokeSlider._element.change(function() {
                            			r.getLayer().getConfig().getStyle().setStroke(null, this.value/100);
                            			r.updateStyleText();
                            		});
                            		
                            		fillSlider._element.change(function() {
                            			r.getLayer().getConfig().getStyle().setFill(null, this.value/100);
                            			r.updateStyleText();
                            		});
                            		
                            		
                            		closeButton.click(
                            			function() {
                            				r._reset();
                            			}
                            		);
                            		
                            		updateButton.click(
                            			function() {
                            				bus.fireEvent(
                            					new LayerEvent(
                            						{
                            							action: 'update_style',
                            							layer: layer
                            						}
                            					)
                            				);
                            			}
                            		);
                            	}
                            );
                            layerUi.attr('id', layerId);
                            
                            // Handles layer selection.
                            layerUi.click(
                                function(event) {                                                                                  
                                    if (!event.shiftKey) {
                                        $('.layer.widgetTheme').removeClass('selected');
                                    } 
                                    layerUi.setSelected(!layerUi.isSelected());
                                });
                            
                            toggle = layerUi.getToggle();
                            toggle.setChecked(true);
                            toggle.click(
                                function(event) {
                                    bus.fireEvent(
                                        new LayerEvent(
                                            {
                                                action: toggle.isChecked() ? 'checked': 'unchecked',
                                                layer: layer
                                            }
                                        )
                                    );
                                }
                            );
                            widget = layerUi.getInfoLink();
                            widget.click(
                                function(event) {
                                	var r = display.getNewMetaDataViewer(),
                                		config = layer.getConfig(),
                                		title = r.getTitle(),
                                		closeButton = r.getCloseButton(),
                                		columns = ['bibliograp', 'collection', 'contact', 'creator','descriptio', 'layer_coll', 'layer_file', 'layer_sour','provider', 'publisher', 'rights', 'scientific', 'title', 'type'],
                                		queryUrl = 'https://' + config.user + '.' + config.host + '/api/v1/sql?q=',
                                  	    query = "SELECT " + columns.join(',') + " FROM " + config.table +  " where scientific = '" + layerName + "'",
                                	    url = queryUrl + query;
                                	console.log("baseurl: " + url);
                                	
                                	title._element.html(layerName);
                                	closeButton.click(
                                		function() {
                                			r._reset();
                                		}
                                	);
                                	
                                	$.getJSON(
                                			url, 
                                            function(data) {
//                                				for (var key in data.rows) {
                                					var row = data.rows[0];
                                					for (var key in row) {
                                						r.addDescription(key.charAt(0).toUpperCase() + key.slice(1), row[key]);
                                					}
//                                				}
                        		            }
                                        );
                                }
                            );
                            break;
                        }
                    }
                );
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
                        controlPosition: ControlPosition.TOP_RIGHT
                    };
                bus.fireEvent(new MapControlEvent(config));     
            }
        }
    );
    
    mol.ui.LayerControl.Layer = mol.ui.Display.extend(
        {
            init: function() {
                this._super(this._html());
            },

            getName: function() {
                var x = this._layerName,
                    s = '.layerNomial';
                return x ? x : (this._layerName = this.findChild(s));
            },
            
            getSubName: function() {
                var x = this._layerSubName,
                    s = '.layerAuthor';
                return x ? x : (this._layerSubName = this.findChild(s));
            }, 
            
            getToggle: function() {
                var x = this._layerToggle,
                    s = '.toggle';
                return x ? x : (this._layerToggle = this.findChild(s));
            },
            
            getType: function() {
                var x = this._layerType,
                    s = '.type';
                return x ? x : (this._layerType = this.findChild(s));
            },
            
            getInfoLink: function() {
                var x = this._layerInfoLink,
                    s = '.info';
                return x ? x : (this._layerInfoLink = this.findChild(s));
            },  

            isSelected: function() {
                var styleNames = this.getStyleName().split(' ');
                return _.indexOf(styleNames, 'selected') > -1;
            },
            
            setSelected: function(selected) {
                if (!selected) {
                    this.removeClass('selected');      
                } else {
                    this.addClass('selected');
                }
            },

            _html: function() {
                return  '<div class="layer widgetTheme">' +
                        '    <button><img class="type" src="/static/maps/search/points.png"></button>' +
                        '    <div class="layerName">' +
                        '        <div class="layerNomial">Smilisca puma</div>' +
                        '    </div>' +
                        '    <div class="buttonContainer">' +
                        '        <input class="toggle" type="checkbox">' +
                        '        <span class="customCheck"></span> ' +
                        '    </div>' +
                        '    <button class="info">i</button>' +
                        '</div>';
            }
        }
    );
    
    mol.ui.LayerControl.MetaDataViewer = mol.ui.Display.extend(
    	{
    		init: function() {
    			this._reset();
    			this._super(this._html());
    		},
    		getTitle: function() {
    			var x = this._title,
            	s = '#title';
    			return x ? x : (this._title = this.findChild(s));
    		},
    		getDescription: function() {
    			var x = this._desc,
            	s = '#description';
    			return x ? x : (this._desc = this.findChild(s));
    		},
    		getCloseButton: function() {
    			var x = this._closeButton,
            	s = '#close_meta';
    			return x ? x : (this._closeButton = this.findChild(s));
    		},
    		addDescription: function(key, value) {
    			this.getDescription()._element.append('<tr><td>'+key+'</td><td>'+value+'</td></tr>');
    		},
    		_reset: function() {
    			$('#meta').remove();
    		},
    		_html: function() {
    			return '<div id="meta" class="metadata widgetTheme">' +
    				'<h1 id="title"></h1>' + 
    				'<table id="description" class="widgetTheme"></table>' +
    				'<button id="close_meta"><img src="/static/maps/search/cancel.png"></button>' +
    				'</div>';
    		}
    	}
    );
    
    /**
     *  
     */
    mol.ui.LayerControl.StyleControl = mol.ui.Display.extend(
    	{
    		init: function(layer) {
    			this._layer = layer;
                this._reset();
                this._super(this._html());
    		},
    		
    		getControl: function() {
    			var x = this._styleControl,
                	s = '#css';
    			return x ? x : (this._styleControl = this.findChild(s));
    		},
    		
    		getStyleText: function() {
    			var x = this._styleText,
                	s = '#css_text';
    			return x ? x : (this._styleText = this.findChild(s));
    		},
    		
    		getFillPalette: function() {
    			var x = this._fillPalette,
            	s = '#fill.color_selector';
    			return x ? x : (this._fillPalette = this.findChild(s));
    		},
    		
    		getStrokePalette: function() {
    			var x = this._strokePalette,
            	s = '#line.color_selector';
    			return x ? x : (this._strokePalette = this.findChild(s));
    		},
    		
    		getFillSlider: function() {
    			var x = this._fillSlider,
            	s = '#fill_alpha';
    			return x ? x : (this._fillSlider = this.findChild(s));
    		},
    		
    		getStrokeSlider: function() {
    			var x = this._strokeSlider,
            	s = '#stroke_alpha';
    			return x ? x : (this._strokeSlider = this.findChild(s));
    		},
    		
    		getCloseButton: function() {
    			var x = this._closeButton,
            	s = '#close_css';
    			return x ? x : (this._closeButton = this.findChild(s));
    		},
    		
    		getUpdateStyleButton: function() {
    			var x = this._updateButton,
            	s = '#update_css';
    			return x ? x : (this._updateButton = this.findChild(s));
    		},
    		
    		_reset: function() {
    			$('#css').remove();
    		},

            _colorPaletteConfig: function(s) {
            	var self = this,
            		style = self.getLayer().getConfig().getStyle(),
    				fillStyle = style.getFill(),
    				strokeStyle = style.getStroke(),
            		color = null;
            	
            	if (s === "#fill") {
					color = 'rgb('+fillStyle.r+','+fillStyle.g+','+fillStyle.b+')';
				} else {
					color = 'rgb('+strokeStyle.r+','+strokeStyle.g+','+strokeStyle.b+')';
				}
            	
            	return {
        			color: color,
        			onShow: function (colpkr) {
        				$(colpkr).fadeIn(500);
        				return false;
        			},
        			onHide: function (colpkr) {
        				$(colpkr).fadeOut(500);
        				return false;
        			},
        			onChange: function (hsb, hex, rgb) {
        				if (s === "#fill") {
        					self.getLayer().getConfig().getStyle().setFill(rgb);
        				} else {
        					self.getLayer().getConfig().getStyle().setStroke(rgb);
        				}
        				$(s + ".color_selector div").css('backgroundColor', '#' + hex);
        				self.updateStyleText();
        			}
        		};
            },
            
            updateStyleText: function() {
            	var self = this;
            	self.getStyleText().val(self.getLayer().getConfig().getStyle().toDisplayString());
            },
            
            _onSliderChange: function() {
            	var self = this;
				self.getLayer().getConfig().getStyle().setFill(null, this.value/100);
				self.updateStyleText();
            },
            
            getLayer: function() {
            	return this._layer;
            },
            
    		_html: function() {
    			var style = this.getLayer().getConfig().getStyle(),
    				fillStyle = style.getFill(),
    				strokeStyle = style.getStroke();

    			return '<div id="css" class="widgetTheme" style="">' +
				'<h1 class="layerNomial">' + this.getLayer().getName() + '</h1><br>' +
				'<textarea id="css_text">' +
				style.toDisplayString() +
				'</textarea>' +
				'<div class="style_block">' +
				'<div id="fill" class="color_selector">' +
				'<div style="background-color: rgb('+fillStyle.r+', '+fillStyle.g+', '+fillStyle.b+'); "></div>' +
				'</div>' +
				'<input id="fill_alpha" type="range"  min="0" max="100" value='+Math.round(fillStyle.a*100)+' style="float:left;" />' +
				'</div>' +
				'<div class="style_block">' +
				'<div id="line" class="color_selector">' +
				'<div style="background-color: rgb('+strokeStyle.r+', '+strokeStyle.g+', '+strokeStyle.b+'); "></div>' +
				'</div>' +
				'<input id="stroke_alpha" type="range"  min="0" max="100" value='+Math.round(strokeStyle.a*100)+' style="float:left;" />' +
				'</div>' +
				'<div class="style_block"><button id="update_css">update css</button></div>' +
				'<button id="close_css"><img src="/static/maps/search/cancel.png"></button>' +
				'</div>';
    		}
    			
    	}
    );
    
    
    /**
     * The LayerControl display.
     */
    mol.ui.LayerControl.Display = mol.ui.Display.extend(
        {
            init: function(config) {
                this._super();
                this.setInnerHtml(this._html());
                this._config = config;
                this._show = true;
                this._shareLink = false;
            },     
            getLayerToggle: function() {
                var x = this._layersToggle,
                    s = '.label';
                return x ? x : (this._layersToggle = this.findChild(s));
            },    
            getAddButton: function() {
                var x = this._addButton,
                    s = '.add';
                return x ? x : (this._addButton = this.findChild(s));
            },  
            getDeleteButton: function() {
                var x = this._deleteButton,
                    s = '.delete';
                return x ? x : (this._deleteButton = this.findChild(s));
            },
            getShareButton: function() {
                var x = this._shareButton,
                    s = '.share';
                return x ? x : (this._shareButton = this.findChild(s));
            },
            getZoomButton: function() {
                var x = this._zoomButton,
                    s = '.zoom';
                return x ? x : (this._zoomButton = this.findChild(s));
            },           
            getNewLayer: function() {
                var Layer = mol.ui.LayerControl.Layer,
                    r = new Layer();
                this.findChild('.scrollContainer').append(r);
                return r;
            },
            getNewStyleControl: function(layer) {
                var r = new mol.ui.LayerControl.StyleControl(layer);
                this.findChild('.scrollContainer').append(r);
                return r;
            },
            getNewMetaDataViewer: function() {
            	var r = new mol.ui.LayerControl.MetaDataViewer();
                this.findChild('.scrollContainer').append(r);
                return r;
            },
            isLayersVisible: function() {
                return this._show;
            },

            toggleShareLink: function(url, status) {
                var r = this._linkContainer,
                    p = '.staticLink',
                    u = '.link';
                this._url = url;
                if ( ! r ){
                    r = this.findChild(p);
                    this._linkContainer = r;
                }
                if (status == false) {
                    r.hide();
                    this._shareLink = false;
                } else if (status==true) {
                    r.show();
                    this._shareLink = true;
                } else {
                    if (this._shareLink ) {  
                        r.hide();
                        this._shareLink = false;
                    } else {
                        r.show();
                        this._shareLink = true;
                    }
                }
                this.findChild('.linkText').val(url);
                this.findChild('.linkText').select();
                
            },
            
            toggleLayers: function(status) {
                var x = this._toggleLayerImg,
                    c = this._layerContainer,
                    s = '.layersToggle',
                    n = '.scrollContainer';
                if ( ! x ){
                    x = this.findChild(s);
                    this._toggleLayerImg = x;
                }
                if ( ! c ){
                    c = this.findChild(n);
                    this._layerContainer = c;
                }
                if (this._show != status) {
                    if (this._show ) {  
                        c.hide();
                        x.attr("src","/static/maps/layers/expand.png");
                        this._show = false;
                    } else {
                        c.show();
                        x.attr("src","/static/maps/layers/collapse.png");
                        this._show = true;
                    }
                }
            },
                    
            _html: function(){
                return  '<div class="mol-LayerControl-Menu ">' +
                        '    <div class="label">' +
                        '       <img class="layersToggle" src="/static/maps/layers/expand.png">' +
                        '    </div>' +
                        '    <div class="widgetTheme share button">Share</div>' +
                        '    <div class="widgetTheme zoom button">Zoom</div>' +
                        '    <div class="widgetTheme delete button">Delete</div>' +
                        '    <div class="widgetTheme add button">Add</div>' +
                        '</div>' +
                        '<div class="mol-LayerControl-Layers">' +
                        '      <div class="staticLink widgetTheme" >' +
                        '          <input type="text" class="linkText" />' +
                        '      </div>' +
                        '   <div class="scrollContainer">' +
                        '   </div>' +
                        '</div>';
            }
        }
    );
};
MOL.modules.LayerList = function(mol) {
    
    mol.ui.LayerList = {};
    
    /**
     * The LayerList engine.
     */
    mol.ui.LayerList.Engine = mol.ui.Engine.extend(
        {
            init: function(api, bus) {
                this._api = api;
                this._bus = bus;
                this._layerIds = [];
            },

            /**
             * Starts the engine and provides a container for its display.
             * 
             * @param container the container for the engine display 
             * @override mol.ui.Engine.start
             */
            start: function(container) {
                var config = this._layerWidgetConfig(),
                    display = new mol.ui.LayerList.Display(config),
                    bus = this._bus,
                    self = this;
                display.setEngine(this);
                // On new layer events add a LayerWidget to the display
                // and wire up events:
                this._bus.bind(
                    mol.events.NEW_LAYER,
                    function(layer) {
                        var layerWidget = self._display.addLayerWidget(layer, config);
                        layerWidget.setEngine(self);
                        layerWidget.getRadioButton().click(
                            self._bus.trigger(
                                mol.events.LAYER_SELECTED, 
                                layer.getId()));
                        // TODO: Add click handlers for all controls...
                    }
                );
            },
            
            /**
             * Gives the engine a new place to go based on a browser history
             * change.
             * 
             * @param place the place to go
             * @override mol.ui.Engine.go
             */
            go: function(place) {

            },
            
            _layerWidgetConfig: function() {
                // TODO
                return {
                };                
            }
        }
    );

    /**
     * The LayerWidget.
     */
    mol.ui.LayerList.LayerWidget = mol.ui.Display.extend(
        {
            init: function(layer, config) {
                this._super('<div>');
                this.setStyleName('mol-LayerList-LayerWidget');
            },

            getLayerId: function() {                
            },
            
            getRadioButton: function() {
            },
            
            getNameLabel: function() {
            },
            
            getCheckbox: function() {
            },
            
            getInfoButton: function() {
            },
            
            getSourceButton: function() {
            }
        }
    ),
    
    /**
     * The LayerList display.
     */
    mol.ui.LayerList.Display = mol.ui.Display.extend(
        {
            init: function(config) {
                this._super('<div>');
                this.setStyleName('mol-LayerList-Display');
                this._widgets = {};
            },

            /**
             * Add a layer widget to the list.
             * 
             * @param layer the layer to add
             * @param config the layer widget config 
             */
            addLayerWidget: function(layer, config) {                
                var layerWidget = null,
                    lid = layer.getId();
                if (this._widgets[lid]) {
                    return;
                }
                layerWidget = new mol.ui.LayerList.LayerWidget({}, layer);
                this._widgets[lid] = layerwidget;
                this.append(layerWidget);                
            },

            /**
             * Deletes a layer widget from the list.
             * 
             * @param layerId the id of the layer to delete
             */
            deleteLayerWidget: function(layerId) {
                var layerWidget = this._widgets[layerId];
                if (!layerWidget) {
                    return;
                }
                layerWidget.remove();
                delete this._widgets[layerId];
            }
        }
    );
};

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

//                this._mapType = new google.maps.ImageMapType(
//                    {
//                        getTileUrl: function(coord, zoom) {
//                            var normalizedCoord = self._getNormalizedCoord(coord, zoom),
//                                bound = Math.pow(2, zoom),
//                                tileParams = '',                                
//                                backendTileApi = 'https://' + config.user + '.' + config.host + '/tiles/' + config.table + '/',
//                                geom_column = "the_geom",
//                		        the_geom = null,
//                		        style = null,
//                                tileurl = null;                                
//
//                            if (!normalizedCoord) {
//                                return null;
//                            }
//                            style = "#" + config.table + config.getStyle().toString().replace(/[\n|\t|\s]/gi, '');
//                            style = encodeURIComponent(style);
//                            
//                            tileParams += "sql=select " + "*" + " from " + config.table + " where scientific = '" + layerName + "'";
//                            tileParams += "&style="+style;
//                            tileurl = backendTileApi + zoom + '/' + normalizedCoord.x + '/' + normalizedCoord.y + '.png?' + tileParams;
//                            return tileurl;
//                        },
//                        tileSize: new google.maps.Size(256, 256),
//                        isPng: true,
//                        name: layerId
//                    });
                if (google.maps.CartoDBLayer) {
                	window.map = map;
                	new google.maps.CartoDBLayer({
                		map_canvas : 'map',
        				map : map,
        				user_name : config.user,
        				table_name : config.table,
        				query : "select * from " + config.table + " where scientific = '" + layerName + "'",
        				map_style : true,
        				infowindow : true,
        				auto_bound : true,
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
/**
 * Search module has a display used as a map control. It allows users to search
 * for layers to add to the map.
 */
MOL.modules.Search = function(mol) {
    
    mol.ui.Search = {};

    /**
     * Converts a CartoDB SQL response to a profile response.
     * 
     */
    mol.ui.Search.CartoDbResult = Class.extend(    
        {
            init: function(response) {
                this.response = response;
            },
            
            convert: function() {
                return {
                    "layers": this.getLayers(this.response), 
                    "names": this.genNames(this.response), 
                    "sources": this.genSources(this.response), 
                    "types": this.genTypes(this.response)
                };
            },

            /**
             * Returns an array of unique values in the response. Key value is 
             * name, source, or type.
             */
            uniques: function(key, response) {
                var results = [],
                    properties = null;

                for (i in response.features) {
                    properties = response.features[i].properties;
                    switch (key) {
                    case 'name':
                        results.push(properties.name);
                        break;
                    case 'type':
                        results.push(properties.type);
                        break;
                    case 'source':
                        results.push(properties.source);
                        break;
                    }
                }
                return _.uniq(results);
            },

            /**
             * Returns the top level names profile object.
             *  
             * {"name": "types":[], "sources":[], "layers":[]}
             * 
             */
            genNames: function(response) {
                var names = this.uniques('name', response),
                    name = null,
                    profile = {};
                
                for (i in names) {
                    name = names[i];
                    profile[name] = this.getNameProfile(name, response);
                }
                
                return profile;
            },
            
            /**
             * Returns the top level types profile object.
             *  
             * {"type": "names":[], "sources":[], "layers":[]}
             * 
             */
            genTypes: function(response) {
                var types = this.uniques('type', response),
                    type = null,
                    profile = {};
                
                for (i in types) {
                    type = types[i];
                    profile[type] = this.getTypeProfile(type, response);
                }
                
                return profile;
            },

            /**
             * Returns the top level source profile object.
             *  
             * {"source": "names":[], "types":[], "layers":[]}
             * 
             */
            genSources: function(response) {
                var sources = this.uniques('source', response),
                    source = null,
                    profile = {};
                
                for (i in sources) {
                    source = sources[i];
                    profile[source] = this.getSourceProfile(source, response);
                }
                
                return profile;
            },

            /**
             * Returns a profile for a single name.
             */
            getNameProfile: function(name, response) {
                var layers = [],
                    sources = [],
                    types = [],
                    properties = null;
                
                for (i in response.features) {
                    properties = response.features[i].properties;
                    if (name === properties.name) {
                        layers.push(i + '');
                        sources.push(properties.source);
                        types.push(properties.type);
                    }
                }
                return {
                    "layers": _.uniq(layers),
                    "sources" : _.uniq(sources),
                    "types": _.uniq(types)
                };
            },

            /**
             * Returns a profile for a single source.
             */
            getSourceProfile: function(source, response) {
                var layers = [],
                    names = [],
                    types = [],
                    properties = null;
                
                for (i in response.features) {
                    properties = response.features[i].properties;
                    if (source === properties.source) {
                        layers.push(i + '');
                        names.push(properties.name);
                        types.push(properties.type);
                    }
                }
                return {
                    "layers": _.uniq(layers),
                    "names" : _.uniq(names),
                    "types": _.uniq(types)
                };
            },

            /**
             * Returns a profile for a single type.
             */
            getTypeProfile: function(type, response) {
                var layers = [],
                    sources = [],
                    names = [],
                    properties = null;
                
                for (i in response.features) {
                    properties = response.features[i].properties;
                    if (type === properties.type) {
                        layers.push(i + '');
                        sources.push(properties.source);
                        names.push(properties.name);
                    }
                }
                return {
                    "layers": _.uniq(layers),
                    "sources" : _.uniq(sources),
                    "names": _.uniq(names)
                };
            },
            
            /**
             * Returns the layers profile.
             */
            getLayers: function(response) {
                var features = response.features,
                    feature = null,
                    key = null,
                    layers = {};

                for (i in features) {
                    feature = features[i];
                    key = i + '';
                    layers[key] = {
                        'name': feature.properties.name,
                        'source': feature.properties.source,
                        'type': feature.properties.type,
                        'extent': feature.geometry.coordinates
                    };
                }
                return layers;
            }            
        }
    );

    /**
     * Wraps a search response and surfaces an API for accessing data from it.
     */
    mol.ui.Search.Result = Class.extend(
        {
            init: function(response) {
                this._response = response;
            },

            /**
             * Gets layer names that satisfy a name, source, and type combined 
             * constraint. 
             *
             * @param name the layer name
             * @param source the layer source
             * @param type the layer type
             * @param profile the profile to test  
             * 
             */
            getLayers: function(name, source, type, profile) {
                var response = this._response,
                    currentProfile = profile ? profile : 'nameProfile',
                    nameProfile = name ? response.names[name] : null,
                    sourceProfile = source ? response.sources[source] : null,
                    typeProfile = type ? response.types[type] : null,
                    profileSatisfied = false;
                
                if (!name && !type && !source){
                    var keys = new Array();
                    for (i in response.layers) {
                        keys.push(i);
                    };
                    return keys;
                }
                
                switch (currentProfile) {
                    
                case 'nameProfile':
                    if (!name) {
                        return this.getLayers(name, source, type, 'sourceProfile');
                    }

                    if (nameProfile) {                                                
                        if (!source && !type) {
                            return nameProfile.layers;
                        }                         
                        if (source && type) {
                            if (this._exists(source, nameProfile.sources) &&
                                this._exists(type, nameProfile.types)) {
                                return _.intersect(
                                    nameProfile.layers, 
                                    this.getLayers(name, source, type, 'sourceProfile'));
                            }
                        } 
                        if (source && !type) {
                            mol.log.info('source no type');
                            if (this._exists(source, nameProfile.sources)) {
                                mol.log.info('return intersect(name.layers, sourceprofile');
                                return _.intersect(
                                   nameProfile.layers, 
                                   this.getLayers(name, source, type, 'sourceProfile'));
                            }
                        } 
                        if (!source && type) {
                            if (this._exists(type, nameProfile.types)) {
                                return _.intersect(
                                    nameProfile.layers, 
                                    this.getLayers(name, source, type, 'typeProfile'));
                            }
                        }                            
                    } 
                    return [];                        
                    
                case 'sourceProfile':
                    if (!source) {
                        return this.getLayers(name, source, type, 'typeProfile');
                    }
                    
                    if (sourceProfile) {                        
                        if (!name && !type) {
                            return sourceProfile.layers;
                        }                         
                        if (name && type) {
                            if (this._exists(name, sourceProfile.names) &&
                                this._exists(type, sourceProfile.types)) {
                                return _.intersect(
                                    sourceProfile.layers, 
                                    this.getLayers(name, source, type, 'typeProfile'));                                
                            }    
                        }                        
                        if (name && !type) {
                            if (this._exists(name, sourceProfile.names)) {
                                mol.log.info('returning source layers');
                                return sourceProfile.layers;
                            }
                        }                         
                        if (!name && type) {
                            if (this._exists(type, sourceProfile.types)) {
                                return _.intersect(
                                    sourceProfile.layers, 
                                    this.getLayers(name, source, type, 'typeProfile'));                                
                            }
                        }                        
                    } 
                    return [];

                case 'typeProfile':
                    if (!type) {
                        return [];
                    }
                    
                    if (typeProfile) {
                        if (!name && !source) {
                            return typeProfile.layers;
                        }
                        if (name && source) {
                            if ( this._exists(name, typeProfile.names) &&
                                 this._exists(source, typeProfile.sources)) {
                                return typeProfile.layers;
                            }                            
                        }                         
                        if (name && !source) {
                            if (this._exists(name, typeProfile.names)) {
                                return typeProfile.layers;
                            }                            
                        }                         
                        if (!name && source) {
                            if (this._exists(source, typeProfile.sources)) {
                                return typeProfile.layers;
                            }                            
                        }                        
                    }                    
                    return [];
                } 
                return [];
            },

            getLayer: function(layer) {
                return this._response.layers[layer];
            },

            getKeys: function(id) {
                var res;
                switch(id.toLowerCase()){
                    case "types":
                        res = this._response.types;
                        break;
                    case "sources":
                        res = this._response.sources;
                        break;
                    case "names":
                        res = this._response.names;
                        break;
                    }
                return _.keys(res);   
            },
            
            getTypeKeys: function() {
                var x = this._typeKeys,
                    types = this._response.types;
                return x ? x : (this._typeKeys = _.keys(types));                
            },

            getType: function(type) {
                return this._response.types[type];
            },

            getSourceKeys: function() {
                var x = this._sourceKeys,
                    sources = this._response.sources;
                return x ? x : (this._sourceKeys = _.keys(sources));
            },
            
            getSource: function(source) {
                return this._response.sources[source];
            },
            
            getNameKeys: function() {
                var x = this._nameKeys,
                    names = this._response.names;
                return x ? x : (this._nameKeys = _.keys(names));
            },

            getName: function(name) {
                return this._response.names[name];
            },

            /**
             * Returns true if the name exists in the array, false otherwise.
             */
            _exists: function(name, array) {
                return _.indexOf(array, name) != -1;
            }
        }
    );

    /**
     * The search engine.
     */
    mol.ui.Search.Engine = mol.ui.Engine.extend(
        {
            /**
             * Constructs the engine.
             * 
             * @constructor
             */
            init: function(api, bus) {
                this._api = api;
                this._bus = bus;
                this._nameFilter = null;
                this._sourceFilter = null;
                this._typeFilter = null;
                this._resultWidgets = [];
            },

            /**
             * Starts the engine by creating and binding the display.
             *
             * @override mol.ui.Engine.start
             */
            start: function(container) {
                var text = {
                    select: 'Select',
                    selections: ['GBIF Species Points', 'MOL Species Range'],
                    go: 'Go',
                    search: 'Search',
                    info: 'more info',
                    next: 'Next Page',
                    add: 'Add',
                    selectAll: 'All',
                    selectNone: 'None'
                };
                this._bindDisplay(new mol.ui.Search.Display(), text);
            },

            /**
             * Gives the engine a new place to go based on a browser history
             * change.
             * 
             * @override mol.ui.Engine.go
             */
            go: function(place) {
                var q = place.q,
                    visible = place.sv ? parseInt(place.sv) : 0,
                    display = this._display,
                    layerKeys = place.layers ? place.layers.split(',') : null,
                    resultWidget = null,
                    layerKey = null,
                    self = this;
                
                if (visible) {
                    display.show();
                }

                if (q) {
                    display.getSearchBox().val(q);
                    this._onGoButtonClick(
                        function() {
                            if (layerKeys) {
                                for (k in layerKeys) {
                                    layerKey = layerKeys[k];
                                    for (x in self._resultWidgets) {
                                        resultWidget = self._resultWidgets[x];
                                        if (resultWidget.key_name === layerKey) {
                                            resultWidget.widget.getCheckbox().setChecked(true);
                                        }
                                    }
                                }
                                self._onAddButtonClick();
                            }
                            
                        }
                        
                    );
                }
            },

            getPlaceState: function() {
                var display = this._display;
                
                return {
                    q: display.getSearchBox().val(),
                    sv: display.isVisible() ? 1 : 0
                };
            },
             
            /**
             * Binds the display.
             */
            _bindDisplay: function(display, text) {                
                var widget = null,
                    result = null,
                    option = null,
                    optionsHtml = '',
                    self = this;

                this._display = display;
                display.setEngine(this);

                this._addLayerControlEventHandler();                

                display.hide();
                //display.getNextButton().hide();
                //display.getAddButton().hide();
                //display.getFiltersWidget().hide();
                display.getResultsContainer().hide();
                //display.getNavigationWidget().hide();

                widget = display.getSelectAllLink();
                widget.text(text.selectAll);
                widget.click(
                    // Selects all the result check boxes:
                    function(event) {
                        var resultWidgets = self._resultWidgets || [],
                            rw = null,
                            result = null,
                            isChecked = null;
                        for (x in resultWidgets) {
                            result = resultWidgets[x];
                            rw = result.widget;
                            rw.findChild('.checkbox').setChecked(true);
                        }                       
                        self._display.getGoButton().click();
                    }
                );

                widget = display.getSelectNoneLink();
                widget.text(text.selectNone);
                widget.click(
                    // Selects all the result check boxes:
                    function(event) {
                        var resultWidgets = self._resultWidgets || [],
                            rw = null,
                            result = null,
                            isChecked = null;
                        for (x in resultWidgets) {
                            result = resultWidgets[x];
                            rw = result.widget;
                            rw.findChild('.checkbox').setChecked(false);
                        }                       
                        self._display.getGoButton().click();
                    }
                );

                // Go button
                widget = display.getGoButton();
                widget.text(text.go);
                widget.click(
                    function(event) {
                        self._onGoButtonClick();
                    }
                );

                widget = display.getSearchBox();
                
                widget.keyup(
                    function(event) {
                      if (event.keyCode === 13) {
                          self._onGoButtonClick();
                      }
                    }
                );

                // Add button:
                widget = display.getAddButton();
                widget.click(
                    function(event) {
                        self._onAddButtonClick();
                    }
                );
                
                // Close button:
                widget = display.getCloseButton();
                widget.click(
                    function(event) {
                        display.hide();
                        display.clearFilters();
                        display.clearResults();
                        display.getResultsContainer().hide();
                        //console.log('close');
                    }
                );
                  
                this._addDisplayToMap();
            },

            _onAddButtonClick: function() {
                var resultWidgets = this._resultWidgets || [],
                    rw = null,
                    result = null,
                    bus = this._bus,
                    api = this._api,
                    LayerAction = mol.ajax.LayerAction,
                    LayerEvent = mol.events.LayerEvent,
                    Layer = mol.model.Layer,
                    callback = null,
                    action = null,
                    display = this._display,
                    layer = null,
                    isChecked = false,
                    config = {
                        layer: layer
                    };

                mol.log.info('Handling add button click');
                display.getAddButton().attr('disabled', true);
                
                for (x in resultWidgets) {
                    result = resultWidgets[x];
                    rw = result.widget;
                    isChecked = rw.findChild('.checkbox').isChecked();
                    
                    if (!isChecked) {
                        continue;
                    }

                    switch (result.type) {
                    
                    case 'points':
                        action = new LayerAction('get-points', {layerName:result.name});
                        callback = this._layerActionCallback(result);
                        api.execute(action, callback);    
                        break;

                    case 'range':
                    case 'ecoregion':
                    case 'pa':
                        layer = new Layer(
                            {
                                type: result.type, 
                                source: result.source,
                                name: result.name, 
                                extent: result.extent
                                //name2: result.name2, 
                                //key_name: result.key_name,
                                //info: result.info
                            } 
                        );
                        config.action = 'add';
                        config.layer = layer;
                        bus.fireEvent(new LayerEvent(config));                               
                        display.getAddButton().attr('disabled', false);                        
                        break;
                    }
                }
            },
            
            _layerActionCallback: function(result) {
                var LayerAction = mol.ajax.LayerAction,
                    ActionCallback = mol.ajax.ActionCallback,
                    LayerEvent = mol.events.LayerEvent,
                    Layer = mol.model.Layer,
                    layer = null,
                    bus = this._bus,
                    action = null,
                    config = {},
                    display = this._display;

                action = new LayerAction('get-points', {layerName:result.name});
                return new ActionCallback(
                    function(response) {
                        layer = new Layer(
                            {
                                type: result.type, 
                                extent: result.extent,
                                source: result.source, 
                                name: result.name, 
                                name2: result.name2, 
                                key_name: result.key_name,
                                json: response
                            }
                        );
                        config.action = 'add';
                        config.layer = layer;
                        bus.fireEvent(new LayerEvent(config));                               
                        display.getAddButton().attr('disabled', false);
                    },
                    function(error) {
                        mol.log.error(error);
                    }
                );
            },

            _displayPage: function(layers) {
                var display = this._display,
                    fw = null,
                    res = null,
                    typeImg = null,
                    sourceImg = null,
                    resultWidgets = null;
                
                this._resultWidgets = [];
                resultWidgets = this._resultWidgets;
                display.clearResults();

                if (layers.length==0){
                    fw = display.noMatches();
                }

                for (r in layers){
                    res = layers[r];
                    fw = display.getNewResult();
                    typeImg = fw.getTypeImg();
                    sourceImg = fw.getSourceImg();

                    resultWidgets.push(
                        {
                            widget: fw, 
                            source: res.source, 
                            extent: res.extent,
                            //source: result.source === 'MOL' ? 'IUCN' : result.source, 
                            type: res.type, 
                            name: res.name,
                            name2: res.name2,
                            key_name: res.key_name,
                            info: {}
                            //info: JSON.parse(res.info)
                        }
                    );

                    fw.getName().text(res.name);
                    fw.getAuthor().text(res.name2);
                    fw.getInfoLink().attr("attr","/static/dead_link.html");
                    sourceImg.attr("src","/static/maps/search/" + res.source.toLowerCase() + ".png");
                    sourceImg.click(function() {
                        mol.log.todo('Send source info to LeftBottom Modal');
                    });
                    typeImg.attr("src","/static/maps/search/" + res.type.toLowerCase() + ".png");
                    typeImg.click(function(){
                        mol.log.todo('Send type info to LeftBottom Modal');
                    });
                }

                display.getResultsContainer().show();
            },

            _allTypesCallback: function(filter, name) {
                var self = this;
                return function(event) {                    
                    var fo = filter.getOptions();
                    for (o in fo) {
                        fo[o].removeStyleName("selected");
                    }
                    new mol.ui.Element(event.target).addStyleName("selected");                    
                    self._processFilterValue(name, null);
                    };
            },

            _optionCallback: function(filter, name) {                
                var self = this;
                return function(event) {
                    var fo = filter.getOptions();
                    for (o in fo){
                        fo[o].removeStyleName("selected");
                    }
                    new mol.ui.Element(event.target).addStyleName("selected");                            
                    self._processFilterValue(name, new mol.ui.Element(event.target).text());
                }; 
            },
            
            _createNewFilter: function(name, data){
                var allTypes,
                    display = this._display,
                    filter = display.getNewFilter(),
                    keys = data[name.toLowerCase()],
                    self = this,
                    option = null,
                    tmpKeys = [],
                    k = null;

                filter.getFilterName().text(name);
                filter.attr('id', name);

                allTypes = filter.getNewOption();
                allTypes.text("All " + name);
                allTypes.addStyleName("all");
                allTypes.click(this._allTypesCallback(filter, name));
                allTypes.addStyleName("selected");
                for (k in keys) {
                    tmpKeys.push(k);
                }
                tmpKeys.sort();
                for (i in tmpKeys) {
                    k = tmpKeys[i];
                    option = filter.getNewOption();
                    option.text(k);
                    option.click(this._optionCallback(filter, name));
                }
            },

            _processFilterValue: function(key, value){
                var layers = new Array(),
                    self = this,
                    tmp = null;
                
                switch(key.toLowerCase()) {
                    case "names":
                        self._nameFilter = value;
                        break;
                    case "sources":
                        self._sourceFilter = value;
                        break;
                    case "types":
                        self._typeFilter= value;
                        break;
                    default:
                        break;
                }
          
                tmp = this._result.getLayers(
                    self._nameFilter,
                    self._sourceFilter,
                    self._typeFilter);

                for (v in tmp) {
                    layers.push(this._result.getLayer(tmp[v]));
                }
                
                this._displayPage(layers);
            },

            _onGoButtonClick: function(cb) {
                var query = this._display.getSearchBox().val(),
                    LayerAction = mol.ajax.LayerAction,
                    action = new LayerAction('search', {query: query}),
                    ActionCallback = mol.ajax.ActionCallback,
                    api = this._api,
                    callback = null,
                    display = this._display,
                    self = this,
                    fn = null,
                    url = null;
                
                url = "http://eighty.cartodb.com/api/v1/sql?q=" 
                    + "select "
                    + "provider as source, "
                    + "type, "
                    + "scientific as name, "
                    + "ST_SetSRID(ST_EXTENT(the_geom), 4326) as the_geom "
                    + "from mol_cody "
                    + "where "
                    + "scientific @@ to_tsquery('" + query +  "') "
                    + "group by provider, type, scientific&format=geojson";

                mol.log.info(url);

                $.getJSON(url,
                    function(response) {
                        var Result = mol.ui.Search.Result,
                            CartoDbResult = mol.ui.Search.CartoDbResult,
                            filterNames = ['Names','Sources','Types'],
                            r = new CartoDbResult(response).convert();
                        self._result = new Result(r),
                        self._displayPage(r.layers);
                        display.clearFilters();
                        for (i in filterNames) {
                            fn = filterNames[i];
                            self._createNewFilter(fn, r);
                        }
                        if (cb) {
                            cb();
                        }
                    }
                );

                    // function(error) {
                    //     mol.log.error(error);
                    // }
                //);

                //     function(data) {
                //         console.log(data);
                //     }
                // );
                
                // callback = new ActionCallback(
                //     function(response) {
                //         var Result = mol.ui.Search.Result,
                //             filterNames = ['Names','Sources','Types'];
                //         self._result = new Result(response),
                //         self._displayPage(response.layers);
                //         display.clearFilters();
                //         for (i in filterNames) {
                //             fn = filterNames[i];
                //             self._createNewFilter(fn,response);
                //         }
                //         if (cb) {
                //             cb();
                //         }
                //     },

                //     function(error) {
                //         mol.log.error(error);
                //     }
                // );

                // api.execute(action, callback);
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
                            display.getSearchBox().focus();
                        }
                    }
                );
            }
        }
    );


    /**
     * A search result display.
     */
    mol.ui.Search.ResultWidget = mol.ui.Display.extend(
        {
            init: function() {
                this._super(this._html());
            },
            
            getCheckbox: function() {
                var x = this._checkbox,
                    s = '.checkbox';
                return x ? x : (this._checkbox = this.findChild(s));
            },
            
            getInfoLink: function() {
                var x = this._infoLink,
                    s = '.info';
                return x ? x : (this._infoLink = this.findChild(s));
            },
            
            getSourceButton: function() {
                var x = this._sourceButton,
                    s = '.source';
                return x ? x : (this._sourceButton = this.findChild(s));
            },
            
            getTypeButton: function() {
                var x = this._typeButton,
                    s = '.source';
                return x ? x : (this._typeButton = this.findChild(s));
            },
            
            getName: function() {
                var x = this._name,
                    s = '.resultNomial';
                return x ? x : (this._name = this.findChild(s));
            },
            getAuthor: function() {
                var x = this._author,
                    s = '.resultAuthor';
                return x ? x : (this._author = this.findChild(s));
            },
            getSourceImg: function() {
                var x = this._source,
                    s = '.source';
                return x ? x : (this._source = this.findChild(s));
            },
            getTypeImg: function() {
                var x = this._typeImg,
                    s = '.type';
                return x ? x : (this._typeImg = this.findChild(s));
            },

            _html: function() {
                return '<ul class="result">' + 
                       '        <div class="resultSource" ><button ><img class="source" src=""></button></div>' + 
                       '        <div class="resultType" ><button ><img class="type" src=""></button></div>' +
                       '        <div class="resultName">' + 
                       '            <div class="resultNomial" ></div>' + 
                       '            <div class="resultAuthor"></div>' + 
                       '        </div>' + 
                       '        <div class="resultLink"><a href="/static/dead_link.html" class="info">more info</a></div>' + 
                       '        <div class="buttonContainer"> ' + 
                       '            <input type="checkbox" class="checkbox" /> ' + 
                       '            <span class="customCheck"></span> ' + 
                       '        </div> ' + 
                       '    </ul>' + 
                       '<div class="break"></div>';
            }
        }
    );
                       
    /**
     * A search filter display
     */
    mol.ui.Search.FilterWidget = mol.ui.Display.extend(
        {
            init: function() {
                this._super(this._html());
                this._filterName = null;
                this._options = null;
            },

            getOptions: function() {
                if (!this._options){
                    this._options = this.findChild('.options');
                }
                return this._options.findChildren('.option');
            },
            
            getAllOption: function() {
                return this.findChild('.allOption');
            },

            getFilterName: function(n) {
                var s = '.filterName';
                if (!this._filterName){
                    this._filterName = this.findChild(s);
                }
                return this._filterName ;
                    
            },
            
            getNewOption: function() {
                if (!this._options){
                    this._options = this.findChild('.options');
                }
                var option = new mol.ui.Element();
                option.setStyleName('option');
                option.setInnerHtml(this._option());
                this._options.append(option);
                return option;
            },
            
            _option: function(){
                return '<div></div>';
            },
            
            _html: function() {
                return  '<div class="filter widgetTheme">' + 
                        '    <div class="filterName">Names</div>' + 
                        '    <div class="options"></div>' + 
                        '</div>';
            }
        }
    );

    /**
     * The search display.
     */
    mol.ui.Search.Display = mol.ui.Display.extend(
        {
            init: function(config) {
                this._super();
                this.setInnerHtml(this._html());
                this._config = config;
            },
            
            clearFilters: function() {
                _.each(
                    this.findChild('.filters').findChildren('.filter'),
                    function(element) {
                        element.remove();
                    }
                );
            },
            
            getFilters: function(id) {
                return this.findChild('#' + id);
            },
            
            getSearchWidget: function(){
                var x = this._searchWidget,
                    s = '.mol-LayerControl-Search';
                return x ? x : (this.searchWidget = this.findChild(s));
            },


            getResultsContainer: function(){
                var x = this._resultsContainer,
                    s = '.mol-LayerControl-Results';
                return x ? x : (this._resultsContainer = this.findChild(s));
            },


            getCloseButton: function(){
                var x = this._closeButton,
                    s = '.cancel';
                return x ? x : (this._closeButton = this.findChild(s));
            },

            getSearchBox: function(){
                var x = this._searchBox,
                    s = '.value';
                return x ? x : (this._searchBox = this.findChild(s));
            }, 
                                    
            getGoButton: function() {
                var x = this._goButton,
                    s = '.execute';
                return x ? x : (this._goButton = this.findChild(s));
            },
            
            getSelectAllLink: function() {
                var x = this._selectAllLink,
                    s = '.selectAll';
                return x ? x : (this._selectAllLink = this.findChild(s));
            },

            getSelectNoneLink: function() {
                var x = this._selectNoneLink,
                    s = '.selectNone';
                return x ? x : (this._selectNoneLink = this.findChild(s));
            },

            getNextButton: function() {
                var x = this._nextButton,
                    s = '.nextPage';
                return x ? x : (this._nextButton = this.findChild(s));
            },

            getAddButton: function(){
                var x = this._addButton,
                    s = '.addAll';
                return x ? x : (this._addButton = this.findChild(s));
            },
            
            clearResults: function(){
                this.findChild('.resultList').setInnerHtml("");
            },
            
            clearFilters: function(){
                this.findChild('.filters').setInnerHtml("");
            },
            
            getNewResult: function(){
                var ResultWidget = mol.ui.Search.ResultWidget,
                    r = new ResultWidget();
                this.findChild('.resultList').append(r);
                return r;
            },
            noMatches: function(){
                var r = new mol.ui.Element('<ul class="result">' + 
                                           '    <i>No matches</a>' + 
                                           '</ul>') ;
                this.findChild('.resultList').append(r);
                return r;
            },
            
            getNewFilter: function(){
                var FilterWidget = mol.ui.Search.FilterWidget,
                    r = new FilterWidget();
                this.findChild('.filters').append(r);
                return r;
            },

            _html: function(){
                return '<div class="mol-LayerControl-Search widgetTheme">' + 
                       '  <div class="title">Search:</div>' + 
                       '  <input class="value" type="text">' + 
                       '  <button class="execute">Go</button>' + 
                       '  <button class="cancel"><img src="/static/maps/search/cancel.png" ></button>' + 
                       '</div>' + 
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
            }
        }
    );
};
MOL.modules.Metadata = function(mol) { 
    
    mol.ui.Metadata = {};

    /**
     * 
     *      
     */
    mol.ui.Metadata.Engine = mol.ui.Engine.extend(
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
                this._collections = {};
                this._collectionIds = {};
            },            
            _showMetadata: function(id) {
                var display = this._display,
                    self = this,
                    api = this._api,
                    ActionCallback = mol.ajax.ActionCallback,
                    LayerAction = mol.ajax.LayerAction;
                
                var par = display.find('li div');
                for (p in par){
                    par[p].removeStyleName('selected');
                }
                var itm = display.find('#'+id.replace(/\//g,"\\/"))[0];
                itm.addStyleName('selected');
                
                //display.getCollectionTitle().text(colText);
                //display.getItemTitle().text(itemText);
                
                var dat = display.findChild('.data');
                var mo = dat.find('.meta-object');
                for (m in mo) {
                    mo[m].removeStyleName('selected');
                }
                var meta = dat.findChild('#'+id.replace(/\//g,"\\/"));
                
                //console.log(meta.getId());
                if (meta.attr('id') != null ) {
                    meta.addStyleName('selected');
                } else {
                    var action = new LayerAction('metadata-item', {key_name:id});
                    var callback = new ActionCallback(
                        function(response) {
                            self._addMetadataResult(response);
                        },

                        function(error) {
                            mol.log.error(error);
                        }
                    );
                    api.execute(action, callback);  
                }
            },
            _addMetadataResult: function(result) {
                var display = this._display,
                    dat = display.findChild('.data'),
                    id = result.key_name,
                    item = true,
                    imgUrl = null,
                    meta = null;
                    
                if (result.key_name.indexOf('collection') === 0) {
                    item = false;
                    imgUrl = "http://maps.google.com/maps/api/staticmap?zoom=0&center=20,0&size=256x128&sensor=false";
                } else {
                    imgUrl = "/data/overview?w=256&h=128&key_name="+result.key_name;
                }
                meta = display.addNewMeta(id);
                meta.addStyleName('selected');
                
                meta.getSource().text(result.data.source + ": ");
                meta.getType().text(result.data.type);
                meta.getName().text(result.data.name);
                
                if (result.data.url) {
                    //result.data.url
                    meta.getUrl().text("original data");
                    meta.getUrl().attr('href',result.data.url);
                }
                if ( result.data.description ){
                    meta.getDescription().text("Description: " + result.data.description);
                }              
                if ( result.data.agreements ){
                    for ( a in result.data.agreements) {
                        meta.newAgreement().text( result.data.agreements[a] );
                    }
                }       
                if ( result.data.references ){
                    for ( r in result.data.references) {
                        meta.newReference().text(
                            result.data.references[r].authors + " " +
                            result.data.references[r].year + ". " +
                            result.data.references[r].title + ". " +
                            result.data.references[r].publication 
                        );
                    }
                }
                if (result.data.spatial) {
                    meta.getSpatialText().text(result.data.spatial.crs.extent.text);
                    meta.getWest().text(result.data.spatial.crs.extent.coordinates[0].toFixed(4));
                    meta.getSouth().text(result.data.spatial.crs.extent.coordinates[1].toFixed(4));
                    meta.getEast().text(result.data.spatial.crs.extent.coordinates[2].toFixed(4));
                    meta.getNorth().text(result.data.spatial.crs.extent.coordinates[3].toFixed(4));
                    
                    meta.overviewImg(imgUrl);
                }
                for (n in result.data.variables) {
                    meta.newVariable(result.data.variables[n].name,result.data.variables[n].value);
                }
                
                if (result.data.storage){
                    meta.getFileDate().text(result.data.storage.uploadDate);
                    meta.getFileLocation().text(result.data.storage.location);
                    meta.getFileFormat().text(result.data.storage.format);
                }
            },
            _itemCallback: function(e) {
                var display = this._display,
                    stE = new mol.ui.Element(e.target);
                var id = stE.attr('id');
                //var itm = display.find('#'+id.replace(/\//g,"\\/"))[0];
                //var col = itm.getParent().getParent().getParent();
                //var colText = col.findChild('.collection').text() + ": ";
                //var itemText = itm.text();
                this._showMetadata(id);
            },
            _collCallback: function(e) {
                var stE = new mol.ui.Element(e.target);
                var id = stE.attr('id');
                this._showMetadata(id); //, stE.text(), " ");
            },

            _deleteDataset: function(layerId) {
                var collectionId = this._collectionIds[layerId],
                    collection = null;
                if (collectionId in this._collections) {
                    collection = this._display.getCollection(collectionId);
                    collection.remove();
                    delete this._collections[collectionId];
                }
            },

            _addDataset: function(layer) {
                var itemId = layer.getKeyName(),
                    itemName = layer.getName(),
                    collectionName = layer.getSubName(),
                    display = this._display,
                    self = this,
                    tmp = ['foo', 'bar'], //itemId.split("/"),
                    collectionId = "collection/" + tmp[0] + "/" + tmp[1] + "/latest",
                    c = null,
                    it = null;
                
                if (! (collectionId in this._collections)){
                    console.log(collectionId);
                    c = display.getNewCollection(collectionId);
                    c.getName().text(collectionName);
                    
                    c.getName().click( function(e) { self._collCallback(e); } );
                    
                    this._collections[collectionId] = {items: {}};
                    this._collectionIds[layer.getId()] = collectionId;
                }
                    
                if (!(itemId in this._collections[collectionId].items)){
                    it = display.getNewItem(itemId,collectionId);
                    it.getName().text(itemName);
                    it.getName().click(function(event){self._itemCallback(event);});
                    this._collections[collectionId].items[itemId] = 0;
                }
            },
            
            /**
             * Starts the engine and provides a container for its display.
             * 
             * @param container the container for the engine display 
             * @override mol.ui.Engine.start
             */
            start: function(container) {
                this._bindDisplay(new mol.ui.Metadata.Display());
            },
             
            /**
             * Binds the display.
             */
            _bindDisplay: function(display, text) {  
                var self = this,
                    bus = this._bus,
                    LayerEvent = mol.events.LayerEvent,
                    LayerControlEvent = mol.events.LayerControlEvent,
                    widget = null;
                    
                this._display = display;
                display.setEngine(this); 
                
                bus.addHandler(
                    LayerControlEvent.TYPE,
                    function(event) {
                        var act = event.getAction(),
                            layerId = event.getLayerId();
                        switch (act) {    
                        case 'delete-click':
                            self._deleteDataset(layerId);
                            break;
                        }
                    }
                );

                bus.addHandler(
                    LayerEvent.TYPE, 
                    function(event) {
                        var act = event.getAction(),
                            layer = null,
                            colText = null,
                            itemText = null;
                        switch (act) {    
                        case 'add':
                            layer = event.getLayer();
                            self._addDataset(layer);
                            break;
                        case 'view-metadata':
                            layer = event.getLayer();
                            colText = layer.getSubName() + ": ";
                            itemText = layer.getName();
                            self._showMetadata(layer.getKeyName(), colText, itemText );
                            document.getElementById('metadata').scrollIntoView(true);
                            widget = self._display.getMapLink();
                            widget.click(
                                function(event) {
                                    bus.fireEvent(new MOL.env.events.LocationEvent({}, 'get-url', true));
                                }
                            );
                            break;                            
                        }
                    }
                );
                
            }
        }
    );

    /**
     * The Meta Object.
     */
    mol.ui.Metadata.Meta = mol.ui.Display.extend(
        {
            init: function(id) {
                this._id = id;
                this._spatial = null;
                this._super('<div class="meta-object" id="'+this._id+'">'+
                            '   <div class="object-title">' +
                            '       <span class="src-path"></span>' +
                            '       <span class="arrow">   </span>' +
                            '       <span class="type-path"></span>' +
                            '   </div>' +
                            '   <div class="name-path"></div>' +
                            '   <a href="" class="url"></a>' +
                            '   <div class="description"></div>' +
                            '   <div class="spatial"></div>' +
                            '   <div class="small-left"></div>' +
                            '   <div class="small-right"></div>' +
                            '   <div class="agreements"> </div>' +
                            '   <div class="references"> </div>' +
                            '</div>');
            },
            _fileInit: function() {
                this._file = new mol.ui.Element();
                this._file.setStyleName('file-data');
                this._file.setInnerHtml('<div class="label">Format:</div>' + 
                                        '   <div class="file-format"></div>' + 
                                        '   <div class="label">Download:</div>' + 
                                        '   <a href="" class="file-location"></a>' + 
                                        '   <div class="label">File date:</div>' + 
                                        '   <div class="file-upload-date">' +
                                        '</div>');
                this.findChild('.small-right').append(this._file);
                return this._file;
            },
            _temporalInit: function() {
                this._temporal = new mol.ui.Element('<div class="temporal">' +
                                 '   <div class="title">Temporal span:</div>' +
                                 '   <div class="start">n/a</div>' +
                                 '   <div class="bar"></div>' +
                                 '   <div class="end">n/a</div>' +
                                 '<div>');
                this.findChild('.small-left').append(this._temporal);
                return this._temporal;
            },
            _variablesInit: function() {
                this._variables = new mol.ui.Element();
                this._variables.setStyleName('variables');
                this._variables.setInnerHtml('<div class="title">Other info:</div>');
                this.findChild('.small-left').append(this._variables);
                return this._variables;
            },
            _spatialInit: function() {
                this._spatial = new mol.ui.Element();
                this._spatial.setInnerHtml('<div class="text">Geography: <span class="spatial-text"></span></div>' +
                                '<div class="spacolumn">' +
                                '  <div class="title">Bounding Box</div>' +
                                '  <div class="bounding-box">' +
                                '      <div class="north">90</div>' +
                                '      <div class="west">-180</div>' +
                                '      <div class="east">180</div>' +
                                '      <div class="south">-90</div>' +
                                '  </div>' +
                                '</div>' +
                                '<div class="spacolumn">' +
                                '  <div class="title">Overview</div>' +
                                '  <div class="map-overview">' +
                                '  </div>' +
                                '</div>');
                this.findChild('.spatial').append(this._spatial);
                return this._spatial;
            },
            getDescription: function() {
                var x = this._desc,
                    s = '.description';
                return x ? x : (this._desc = this.findChild(s));
            },
            newAgreement: function(){
                var s = '.agreements',
                    n = new mol.ui.Element();
                n.setStyleName('agreement-text');
                this.findChild(s).append(n);
                return n;                
            },
            newReference: function(){
                var s = '.references',
                    n = new mol.ui.Element();
                n.setStyleName('reference-text');
                this.findChild(s).append(n);
                return n;                
            },
            getFileFormat: function(){
                var fi = this._file ? this._file : this._fileInit(),
                    x = this._ff,
                    s = '.file-format';
                return x ? x : (this._ff = this.findChild(s));
            },
            getFileLocation: function(){
                var fi = this._file ? this._file : this._fileInit(),
                    x = this._fl,
                    s = '.file-location';
                return x ? x : (this._fl = this.findChild(s));
            },
            getFileDate: function(){
                var fi = this._file ? this._file : this._fileInit(),
                    x = this._fu,
                    s = '.file-upload-date';
                return x ? x : (this._fu = this.findChild(s));
            },
            newVariable: function(name,value){
                var vb = this._variables ? this._variables : this._variablesInit(),
                    x = new mol.ui.Element();
                    x.setStyleName('variable');
                    x.setInnerHtml('<div class="name">'+name+':</div>' +
                                   '<div class="value">'+value+'</div>');
                this.findChild('.variables').append(x);
                return x;
            },
            overviewImg: function(src) {
                var sp = this._spatial ? this._spatial : this._spatialInit(),
                    x = this._ovimg,
                    s = '.map-overview';
                if (x) {
                    return x;
                } else {
                    this._ovimg = new mol.ui.Element('<img class="overview-img"  src="'+src+'"/>');
                    this.findChild(s).append(this._ovimg);
                    return this._ovimg;
                }
            },
            getNorth: function() {
                var sp = this._spatial ? this._spatial : this._spatialInit(),
                    x = this._north,
                    s = '.north';
                return x ? x : (this._north = this.findChild(s));
            },
            getSouth: function() {
                var sp = this._spatial ? this._spatial : this._spatialInit(),
                    x = this._south,
                    s = '.south';
                return x ? x : (this._south = this.findChild(s));
            },
            getEast: function() {
                var sp = this._spatial ? this._spatial : this._spatialInit(),
                    x = this._east,
                    s = '.east';
                return x ? x : (this._east = this.findChild(s));
            },
            getWest: function() {
                var sp = this._spatial ? this._spatial : this._spatialInit(),
                    x = this._west,
                    s = '.west';
                return x ? x : (this._west = this.findChild(s));
            },
            getSpatialText: function() {
                var sp = this._spatial ? this._spatial : this._spatialInit(),
                    x = this._sptext,
                    s = '.spatial-text';
                return x ? x : (this._sptext = this.findChild(s));
            },
            getSource: function() {
                var x = this._src,
                    s = '.src-path';
                return x ? x : (this._src = this.findChild(s));
            },
            getType: function() {
                var x = this._type,
                    s = '.type-path';
                return x ? x : (this._type = this.findChild(s));
            },
            getName: function() {
                var x = this._name,
                    s = '.name-path';
                return x ? x : (this._name = this.findChild(s));
            },
            getUrl: function() {
                var x = this._url,
                    s = '.url';
                return x ? x : (this._url = this.findChild(s));
            }            
        }
    );
    /**
     * The Item.
     */
    mol.ui.Metadata.Item = mol.ui.Display.extend(
        {
            init: function(itemId) {
                this._id = itemId;
                this._super('<li id="container-'+this._id +'">' + 
                            '   <div id="'+this._id+'" class="item">item 1</div>' + 
                            '</li>');
            },
            getName: function() {
                var x = this._itemName,
                    s = '.item';
                return x ? x : (this._itemName = this.findChild(s));
            }
        }
    );
    /**
     * The Collection.
     */
    mol.ui.Metadata.Collection = mol.ui.Display.extend(
        {
            init: function(collectionId) {
                this._id = collectionId;
                this._super('<li id="container-' + this._id + '">' +
                        '<div id="' + this._id + '" class="collection">Collection 1</div>' +
                        '<ul class="item-list">' +
                        '</ul></li>');
            },
            getName: function() {
                var x = this._collectionName,
                    s = '.collection';
                return x ? x : (this._collectionName = this.findChild(s));
            },
            setSelected: function() {
                var s = '.collection';
                this.findChild(s).select();
            }
        }
    );
    /**
     * The Metadata Display <div> in the <body> element.
     */
    mol.ui.Metadata.Display = mol.ui.Display.extend(
        {

            /**
             * Constructs a new Metadata Display.
             * 
             * @param config the display configuration
             * @constructor
             */
            init: function(config) {
                this._id = 'metadata';
                this._super($('<div>').attr({'id': this._id}));
                $('body').append(this.getElement());
                this.setInnerHtml(this._html());
            },

            getCollection: function(collectionId) {
                console.log(collectionId);
                return this.findChild('#container-'+collectionId.replace(/\//g,"\\/"));
            },

            getNewCollection:  function(collectionId){
                var Collection = mol.ui.Metadata.Collection,
                    //Meta = mol.ui.Metadata.Meta,
                    r = new Collection(collectionId);
                    //mo = new Meta(collectionId);
                //this.findChild('.data').append(mo);
                this.findChild('.collection-list').append(r);
                return r;
            },
            getNewItem:  function(itemId,collectionId){
                var Item = mol.ui.Metadata.Item,
                    //Meta = mol.ui.Metadata.Meta,
                    r = new Item(itemId);
                //this.findChild('.data').append(mo);
                this.findChild('#container-'+collectionId.replace(/\//g,"\\/")).findChild('.item-list').append(r);
                return r;
            },
            addNewMeta: function(itemId) {
                var Meta = mol.ui.Metadata.Meta;
                var mo = new Meta(itemId);
                this.findChild('.data').append(mo);
                return mo;
            },
            getCollectionTitle: function(){
                var x = this._collectionTitle,
                    s = '.collection-path';
                return x ? x : (this._collectionTitle = this.findChild(s));
            },
            getItemTitle: function(){
                var x = this._itemTitle,
                    s = '.item-path';
                return x ? x : (this._itemTitle = this.findChild(s));
            },

            getMapLink: function() {
              var x = this._mapLink,
                  s = '.mapLink';
                return x ? x : (this._mapLink = this.findChild(s));
            },

            selectItem: function(id) {
                //TODO deselect all items/collections and select the one passed by ID
            },
                    
            _html: function(){
                return  '<div class="mol-Metadata">' +
						'    <div class="top-bar">' +
						'        <a class="mapLink" href="#">Back to Map</a>' +
						'        <div class="details-menu">' +
						'            <div class="view-option selected">basic</div>' +
						'            <div class="view-option">full</div>' +
						'            <div class="title">Metadata view:</div>' +
						'        </div>' +
						'    </div>' +
						'    <div class="object-menu">' +
						'        <div class="title">Mapped data</div>' +
						'        <ul class="collection-list">' +
						'        </ul>' +
						'    </div>' +
						'    <div class="object-viewer">' +
						'        <div class="details-window">' +
						'            <div class="title">Data:</div>' +
						'            <div class="data">' +
						'            </div>' +
						'        </div>' +
						'    </div>' +
						'</div>';
            }       
        }
    );
};
