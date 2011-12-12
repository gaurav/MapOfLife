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
                
                // Clicking the search button fires a LayerControlEvent:
                widget = display.getSearchButton();
                widget.click(
                    function(event) {
                        bus.fireEvent(new LayerControlEvent('search-click'));
                        display.toggleShareLink("", false);
                        $(".mol-LayerControl-Search").find("input").focus();
                    }
                );
                
                //  Clicking the add button fires a LayerControlEvent:
                widget = display.getAddButton();
                widget.click(
                    function(event) {
                        bus.fireEvent(new LayerControlEvent('add-click'));
                        display.toggleShareLink("", false);
//                        $(".mol-LayerControl-Search").find("input").focus();
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
                                		columns = ['bibliograp', 'collection', 
                                                   'contact', 'creator',
                                                   'descriptio', 'layer_coll', 
                                                   'layer_file', 'layer_sour',
                                                   'provider', 'publisher', 
                                                   'rights', 'scientific', 
                                                   'title', 'type'],
                                		queryUrl = 'https://' + config.user + '.' + config.host + '/api/v1/sql?q=',
                                  	    query = "SELECT " + columns.join(',') + 
                                                " FROM " + config.table +  
                                                " WHERE scientific = '" + layerName + "'",
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
                                                // for (var key in data.rows) {
                                					var row = data.rows[0];
                                					for (var key in row) {
                                						r.addDescription(key.charAt(0).toUpperCase() + key.slice(1), row[key]);
                                					}
                                				// }
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
            getSearchButton: function() {
                var x = this._searchButton,
                    s = '.search';
                return x ? x : (this._searchButton = this.findChild(s));
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
                if (!c) {
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
                        '    <div class="widgetTheme search button">Search</div>' +
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
