if(process.argv.includes('--verify-installation'))require('./smoke.cjs');
else require('./main.cjs').startDesktop();
