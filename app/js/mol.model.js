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
