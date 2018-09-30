#!/usr/bin/env node
'use strict';
const program = require('commander');
const TwitchArchiver = require('./src/TwitchArchiver');

program
  .version('0.0.1')
  .option('-u --user <user>', 'User to archive')
  .option('-f --formatPriority <priority>', 'File storing the video quality priority list.')
  .option('-a --apiKey <apikey>', 'Twitch API key.')
  .option('-b --blacklist <blacklist>', 'File containing video blacklist')
  .option('-o --output <output>', 'Directory to output file')
  .option('-v --verbose', 'Be verbose.')
  .parse(process.argv);

if (process.argv.slice(2).length < 10) {
  program.outputHelp();
  process.exit(1);
}

let twitchArchiver = new TwitchArchiver(program.apiKey);

twitchArchiver.run(program.user, program.formatPriority, program.blacklist, program.output, program.verbose)
.then(result => {
  if(result) {
    console.log(twitchArchiver.getErrorMessage(result));
    process.exit(result);
  }

  process.exit(0);
});
