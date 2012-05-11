mol.modules.map.splash = function(mol) {

    mol.map.splash = {};

    mol.map.splash.SplashEngine = mol.mvp.Engine.extend(
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

                this.display = new mol.map.splash.splashDisplay();
		if(this.getIEVersion()<9 && this.getIEVersion()>=0) {
			//old ie8, please upgrade
			this.display.iframe_content.src='/static/splash/ie8.html';
			this.initDialog();
			//$(this.display).find('.ui-dialog-titlebar-close').toggle(false);
			//$(this.display).dialog( "option", "closeOnEscape", false );
			this.display.mesg.append($("<font color='red'>Your version of Internet Explorer is not supported. <br> Please use the latest version of Chrome, Safari, Firefox, or Internet Explorer.</font>"));
			$(this.display).dialog( "option", "closeOnEscape", false );
			$(this.display).bind( "dialogbeforeclose", function(event, ui) {
				alert('Your version of Internet Explorer is not supported. Please use the latest version of Chrome, Safari, Firefox, or Internet Explorer.');
  				return false;
			});
		        window.stop();

		} else {
			this.initDialog();
		}
            },
            initDialog: function() {
                this.display.dialog(
                    {
                        autoOpen: true,
			width: 800,
			height: 580,
			dialogClass: "mol-splash",
			modal: true
                    }
                );
                 $(this.display).width('98%');

            },
	    // Returns the version of Internet Explorer or a -1
            // (indicating the use of another browser).
	    getIEVersion: function() {
  			var rv = -1, ua,re; // Return value assumes failure.
  			if (navigator.appName == 'Microsoft Internet Explorer'){
    				ua = navigator.userAgent;
   				re  = new RegExp("MSIE ([0-9]{1,}[\.0-9]{0,})");
    				if (re.exec(ua) != null){
      					rv = parseFloat( RegExp.$1 );
				}
			}
  			return rv;
		}
        }
    );

    mol.map.splash.splashDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var sharing_buttons = '' +
                    '<!-- AddThis Button BEGIN --> <div class="addthis_toolbox addthis_default_style addthis_counter_style ">' +
                        '<a class="addthis_button_facebook_like" fb:like:layout="button_count"></a>' + 
                        '<a class="addthis_button_tweet"></a>' +
                        '<a class="addthis_button_google_plusone" g:plusone:size="medium"></a>' +
                        '<a class="addthis_counter addthis_pill_style"></a>' +
                        //'<a class="addthis_button_preferred_1"></a> ' +
                        //'<a class="addthis_button_preferred_2"></a> ' +
                        // '<a class="addthis_button_preferred_3"></a> ' +
                        // '<a class="addthis_button_preferred_4"></a> ' +
                        // '<a class="addthis_button_compact"></a>' + 
                        // '<a class="addthis_counter addthis_bubble_style"></a>' +
                        '</div>  <script type="text/javascript">' + 
                        'var addthis_config = {"data_track_addressbar":true};' + 
                        'var addthis_share = {"url": "http://www.mappinglife.org/"};' +
                        '</script>  <script type="text/javascript" src="http://s7.addthis.com/js/250/addthis_widget.js#pubid=ra-4fad74ac7e04ff72"></script>  <!-- AddThis Button END -->'
                    ;

                var html = '' +
        '<div>' +
	'<div class="message"></div>' +
        sharing_buttons + 
        '<iframe class="mol-splash iframe_content ui-dialog-content" style="height:400px; width: 98%; margin-left: -18px; margin-right: auto; display: block;" src="/static/splash/index.html"></iframe>' +
	'<div id="footer_imgs" style="text-align: center">' +
        '<div>Sponsors, partners and supporters</div>' +
        '<a target="_blank" href="http://www.yale.edu/jetz/"><button><img width="72px" height="36px" title="Jetz Lab, Yale University" src="/static/home/yale.png"></button></a>' +
        '<a target="_blank" href="http://sites.google.com/site/robgur/"><button><img width="149px" height="36px" title="Guralnick Lab, University of Colorado Boulder" src="/static/home/cuboulder.png"></button></a>' +

        '<a target="_blank" href="http://www.iucn.org/"><button><img width="33px" height="32px" title="International Union for Conservation of Nature" src="/static/home/iucn.png"></button></a>' +
        '<a target="_blank" href="http://www.gbif.org/"><button><img width="33px" height="32px" title="Global Biodiversity Information Facility" src="/static/home/gbif.png"></button></a>' +
	'<a target="_blank" href="http://www.eol.org/"><button><img width="51px" height="32px" title="Encyclopedia of Life" src="http://www.mappinglife.org/static/home/eol.png"></button></a>' +
	'<a target="_blank" href="http://www.nasa.gov/"><button><img width="37px" height="32px" title="National Aeronautics and Space Administration" src="http://www.mappinglife.org/static/home/nasa.png"></button></a>' +
        '<br>' +
	'<a target="_blank" href="http://www.nceas.ucsb.edu/"><button><img width="30px" height="32px" title="National Center for Ecological Analysis and Synthesis" src="http://www.mappinglife.org/static/home/nceas.png"></button></a>' +
	'<a target="_blank" href="http://www.iplantcollaborative.org/"><button><img width="105px" height="32px" title="iPlant Collaborative" src="http://www.mappinglife.org/static/home/iplant.png"></button></a>' +
	'<a target="_blank" href="http://www.nsf.gov/"><button><img width="32px" height="32px" title="National Science Foundation" src="http://www.mappinglife.org/static/home/nsf.png"></button></a>' +
	'<a target="_blank" href="http://www.senckenberg.de"><button><img width="81px" height="32px"title="Senckenberg" src="http://www.mappinglife.org/static/home/senckenberg.png"></button></a>' +
	'<a target="_blank" href="http://www.bik-f.de/"><button><img width="74px" height="32px" title="Biodiversität und Klima Forschungszentrum (BiK-F)" src="http://www.mappinglife.org/static/home/bik_bildzeichen.png"></button></a>' +
	'<a target="_blank" href="http://www.mountainbiodiversity.org/"><button><img width="59px" height="32px" title="Global Mountain Biodiversity Assessment" src="http://www.mappinglife.org/static/home/gmba.png"></button></a>' +
	'</div>' +
        '</div>';

                this._super(html);
                this.iframe_content = $(this).find('.iframe_content');
		this.mesg = $(this).find('.message');




            }
        }
    );
};



