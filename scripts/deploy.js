const fs = require('fs');
const path = require('path');

const serviceFilePath = '/etc/systemd/system/mathbunk.service';

const workingDir = path.dirname(__dirname);
const execStartPath = path.join(workingDir, 'src', 'app.js');

const serviceContent = `
[Unit]
Description=Mathbunk

[Service]
ExecStart=${execStartPath}
Restart=always
User=nobody
Group=nogroup
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=${workingDir}

[Install]
WantedBy=multi-user.target
`;

fs.readFile(serviceFilePath, 'utf8', (err, existingContent) => {
  if (err || existingContent !== serviceContent) {
    fs.writeFile(serviceFilePath, serviceContent, (writeErr) => {
      if (writeErr) {
        console.error('Error writing service file:', writeErr);
      } else {
        console.log('Service file updated or created successfully.');

        const exec = require('child_process').exec;
        exec('systemctl daemon-reload', (reloadErr, stdout, stderr) => {
          if (reloadErr) {
            console.error('Error reloading systemd:', reloadErr);
          } else {
            console.log('Systemd daemon reloaded.');

            exec('systemctl enable mathbunk.service && systemctl start mathbunk.service', (startErr) => {
              if (startErr) {
                console.error('Error starting service:', startErr);
              } else {
                console.log('Service started successfully.');
              }
            });
          }
        });
      }
    });
  } else {
    console.log('Service file already up to date. Restarting');
    
    const exec = require('child_process').exec;
    exec('systemctl restart mathbunk.service', (restartErr) => {
      if (restartErr) {
        console.error('Error starting service:', restartErr);
      } else {
        console.log('Service started successfully.');
      }
    });
  }
});
