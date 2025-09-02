// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'adjamegare-backend',
      script: './server.js',           
      instances: 1,                     
      exec_mode: 'fork',                
      watch: false,                     
      autorestart: true,                
      max_restarts: 10,                 
      restart_delay: 5000,              
      max_memory_restart: '500M',       
      env_development: {                
        NODE_ENV: 'development',
        PORT: process.env.PORT || 5000
      },
      env_production: {                 // environnement prod
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5000
      },
      error_file: './logs/err.log',     // log erreurs
      out_file: './logs/out.log',       // log sortie normale
      log_date_format: 'YYYY-MM-DD HH:mm:ss', // format date dans les logs
      merge_logs: true,                 // fusionner stdout/stderr par app
      autorestart: true                 // s’assure que l’app redémarre automatiquement
    }
  ]
};
