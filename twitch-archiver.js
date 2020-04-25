#!/usr/bin/env node
'use strict';

// Include commander for easy CLI parameters
const program = require('commander');

// Include the core class
const TwitchArchiver = require('./src/TwitchArchiver');

// Define the program options, parse from argv
program
  .version('0.0.1')
  .option('-u --user <user>', 'User to archive')
  .option('-f --formatPriority <priority>', 'File storing the video quality priority list.')
  .option('-a --apiKey <apikey>', 'Twitch API key.')
  .option('-b --blacklist <blacklist>', 'File containing video blacklist')
  .option('-o --output <output>', 'Directory to output file')
  .option('-v --verbose', 'Be verbose.')
  .parse(process.argv);


// Check enough arguments have been passed through
// The first two variables in argv are node and the script location
// the rest are the actual program arguments.
if (process.argv.slice(2).length < 10) {
  program.outputHelp();
  process.exit(1);
}

// Make a new object of our program class
let twitchArchiver = new TwitchArchiver(program.apiKey);

// Run the twitch archiver, with the provided properties
twitchArchiver.run(program.user, program.formatPriority, program.blacklist, program.output, program.verbose)
.then(result => {
  // If our result is non-0, it's an error
  if(result) {
    // Print the error message and exit with the right status code
    console.log(twitchArchiver.getErrorMessage(result));
    process.exit(result);
  }

  // Successful exit
  process.exit(0);
});
