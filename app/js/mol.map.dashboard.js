mol.modules.map.dashboard = function(mol) {

    mol.map.dashboard = {};

    mol.map.dashboard.DashboardEngine = mol.mvp.Engine.extend(
        {
            init: function(proxy, bus) {
                this.proxy = proxy;
                this.bus = bus;
                this.sql = '';
//Here is the sql to use for polygon dash requests.
/*SELECT s.provider as provider, s.type as type, num_species, num_records, s.class FROM
    (SELECT provider, type, count(*) as num_species, class
        FROM
        (SELECT DISTINCT scientificname, provider, type from gbif_import) p,
        (SELECT DISTINCT scientific, class from master_taxonomy) t
    WHERE p.scientificname = t.scientific
    GROUP BY provider, type, class
        ) s,
    (SELECT provider, type, count(*) as num_records, class
    FROM
        (SELECT scientificname, provider, type from gbif_import) pr,
        (SELECT DISTINCT scientific, class from master_taxonomy) tr
    WHERE pr.scientificname = tr.scientific
    GROUP BY provider, type, class
        ) r
 WHERE
    r.provider = s.provider and r.type = s.type and r.class = s.class;
*/            },

            /**
             * Starts the MenuEngine. Note that the container parameter is
             * ignored.
             */
            start: function() {
                this.display = new mol.map.dashboard.DashboardDisplay();
                this.initDialog();
                this.addEventHandlers();
            },

            /**
             * Adds a handler for the 'search-display-toggle' event which
             * controls display visibility. Also adds UI event handlers for the
             * display.
             */
            addEventHandlers: function() {
                var self = this;

                /**
                 * Callback that toggles the dashboard display visibility.
                 *
                 * @param event mol.bus.Event
                 */
                this.bus.addHandler(
                    'taxonomy-dashboard-toggle',
                    function(event) {
                        var params = null,
                            e = null;

                        if (event.state === undefined) {
                            if(self.display.dialog('isOpen')) {
                                self.display.dialog('close');
                            } else {
                                self.display.dialog('open');
                            }
                        } else {
                            self.display.dialog(event.state);
                        }
                    }
                );

                _.each(
                    this.display.providers,
                    function(tr) {
                        var provider = $(tr).attr('class').replace('provider','').trim(),
                            type = $(tr).find('.type').attr('class').replace('type','').trim();
                        _.each(
                            $(tr).find('.class'),
                            function(td) {
                                $(td).click (
                                    function(event) {
                                        var _class = $(td).attr('class').replace('class','').trim();
                                        self.bus.fireEvent(new mol.bus.Event('metadata-toggle',{ params :{provider: provider, type: type, _class: _class, text: $(this).text()}}));
                                    }
                                )
                            }
                        )

                    }
                );
                _.each(
                    this.display.types,
                    function(td) {
                         var type = $(td).attr('class').replace('type','').trim();
                         $(td).click (
                                    function(event) {
                                        var _class = $(this).attr('class').replace('class','').trim();
                                        self.bus.fireEvent(new mol.bus.Event('metadata-toggle',{ params :{type: type}}));
                                    }
                         );
                    }
                )
            },

            /**
             * Fires the 'add-map-control' event. The mol.map.MapEngine handles
             * this event and adds the display to the map.
             */
            initDialog: function() {
                this.display.dialog(
                    {
                        autoOpen: false,
					    width: 1000,
					    dialogClass: "mol-Dashboard"
                    }
                );
            }
        }
    );

    mol.map.dashboard.DashboardDisplay = mol.mvp.View.extend(
        {
            init: function() {
                var html = '' +
                    '<div id="dialog">' +
                    '  <div class="dashboard">' +
                    '  <div class="title">Dashboard</div>' +
                    '  <div class="subtitle">Statistics for data served by the Map of Life</div>' +
                    '  <table>' +
                    '   <thead>' +
                    '    <tr>' +
                    '      <th width="50px"><b>Type</b></th>' +
                    '      <th width="100px"><b>Source</b></th>' +
                    '      <th><b>Amphibians</b></th>' +
                    '      <th><b>Birds</b></th>' +
                    '      <th><b>Mammals</b></th>' +
                    '      <th><b>Reptiles</b></th>' +
                    '      <th><b>Freshwater fishes</b></th>' +
                    '    </tr>' +
                    '   </thead>' +
                    '   <tbody>' +
                    '    <tr class="provider gbif">' +
                    '      <td class="type points">Points</td>' +
                    '      <td class="providertitle">GBIF</td>' +
                    '      <td class="class amphibia">5,662 species names with 1,794,441 records</td>' +
                    '      <td class="class aves">13,000 species names with 132,412,174 records</td>' +
                    '      <td class="class mammalia">14,095 species names with 4,351,065 records</td>' +
                    '      <td class="class reptilia">11,445 species names with 1,695,170 records</td>' +
                    '      <td class="class fish">37,850 species names with 7,635,630 records</td>' +
                    '   </tr>' +
                    '   <tr>' +
                    '       <td class="type range">Expert maps</td>' +
                    '       <td class="providertitle">User-uploaded</td>' +
                    '       <td></td>' +
                    '       <td class="provider jetz"><div class="class aves"><div class="type range"/>Jetz et al. 2012: 9,869 species with 28,019 records</div></td>' +
                    '       <td></td>' +
                    '       <td></td>' +
                    '       <td class="provider fishes"><div class="class fish"><div class="type range"/>Page and Burr, 2011: 723 species with 9,755 records</div></td>' +
                    '   </tr>' +
                    '   <tr class="provider iucn">' +
                    '       <td class="type range">Expert maps</td>' +
                    '       <td class="providertitle">IUCN</td>' +
                    '       <td class="class amphibia ">5,966 species with 18,852 records</td>' +
                    '       <td></td>' +
                    '       <td class="class mammalia">4,081 species with 38,673 records</td>' +
                    '       <td class="class reptilia">2,532 species with 25,652 records</td>' +
                    '       <td></td>' +
                    '   </tr>' +
                    '   <tr class="provider wdpa">' +
                    '       <td class="type protectedarea">Local Inventories</td>' +
                    '       <td class="providertitle">Misc. sources</td>' +
                    '       <td class="class amphibia">727 species with 1,820 records</td>' +
                    '       <td class="class aves">4,042 species with 48,000 records</td>' +
                    '       <td class="class mammalia">1,411 species with 9,895 records</td>' +
                    '       <td></td>' +
                    '       <td></td>' +
                    '   </tr>' +
                    '   <tr class="provider wwf">' +
                    '       <td class="type ecoregion">Regional checklists</td>' +
                    '       <td class="providertitle">WWF</td>' +
                    '       <td class="class amphibia">3,081 species with 12,296 records</td>' +
                    '       <td class="class aves">8,755 species with 201,418 records</td>' +
                    '       <td class="class mammalia">4,224 species with 67,533 records</td>' +
                    '       <td class="class osteichthyes">6,830 species with 67,533 records</td>' +
                    '       <td></td>' +
                    '   </tr>' +
                    '   </tbody>' +
                    '  </table>' +
                    '</div>  ';

                this._super(html);
                this.providers = $(this).find('.provider');
                this.types = $(this).find('.type');



            }
        }
    );
};



