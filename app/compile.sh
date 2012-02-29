#!/bin/sh

cd js

rm -rf ../static/js/mol.js

cat mol.js mol.core.js mol.bus.js mol.mvp.js mol.services.js mol.services.cartodb.js mol.map.js mol.map.loading.js mol.map.layers.js mol.map.menu.js mol.map.results.js mol.map.search.js mol.map.tiles.js mol.map.dashboard.js mol.map.query.js > ../static/js/mol.js

cd ..
