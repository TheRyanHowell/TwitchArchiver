#!/usr/bin/env node
'use strict';

// Dependencies
const fs = require('fs');
const twitchAPI = require('twitch-api-v5');
const moment = require('moment');
const sanitize = require('sanitize-filename');
const levenshtein = require('fast-levenshtein')
const { spawnSync } = require('child_process');

let self = null;

class TwitchArchiver {
  constructor(apiKey) {
    // Set twitch API Key
    twitchAPI.clientID = apiKey;

    // Define possible error messages
    this.errorMessages = {
      1: 'Invalid error message.',
      2: 'Lock file exists.',
      3: 'Priority file does not exist.',
      4: 'Blacklist file does not exist.',
      5: 'Output directory does not exist.',
      6: 'Could not get format priority.',
      7: 'Could not get blacklist.',
      8: 'Could not find channel.',
      9: 'Unable to get videos.'
    };

    // Create self relation
    self = this;
  }

  // Function to check if it's possible to run given the parameters
  // Return a specific status code for each type of error
  canRun() {
    if(fs.existsSync('dl.lock')) {
      return 2;
    }

    if(!fs.existsSync(this.priority) || fs.statSync(this.priority).isDirectory()) {
      return 3;
    }

    if(!fs.existsSync(this.blacklist) || fs.statSync(this.blacklist).isDirectory()) {
      return 4;
    }

    if(!fs.existsSync(this.output) || !fs.statSync(this.output).isDirectory()) {
      return 5;
    }

    return 0;
  }

  // Function to get the error message from an error code
  getErrorMessage(errorCode) {
    if(errorCode in this.errorMessages) {
      return this.errorMessages[errorCode];
    } else {
      return this.errorMessages[1];
    }
  }

  // Function to download videos of a user, main entrypoint
  async run(user, priority, blacklist, output, verbose) {
    // Init
    this.user = user;
    this.priority = priority;
    this.blacklist = blacklist;
    this.output = output;
    this.verbose = verbose;

    // Determine if parameters are correct
    let runnable = this.canRun(priority, blacklist, output);
    if(runnable !== 0) {
      return runnable;
    }

    // Get the priority list
    this.priority = this.readFormatPriority(this.priority);
    if(!this.priority) {
      return 6;
    }

    this.log('Priority list: ');
    this.log(this.priority);

    // Get the blacklist
    this.blacklist = this.readBlacklist(this.blacklist);
    if(!this.blacklist) {
      return 7;
    }

    this.log('Blacklist: ');
    this.log(this.blacklist);

    this.lock();

    // Get the channelid from channel name
    let channelID = null;
    try {
      channelID = await this.getChannelID(user);
      if(!channelID) {
        this.unlock();
        return 8;
      }
    } catch (e) {
      this.log(e);
      this.unlock();
      return 8;
    }

    // Get a list of last 100 videos of that user
    let videos = null;
    try {
      videos = await this.getVideos(channelID);
      if(!videos) {
        this.unlock();
        return 9;
      }
    } catch (e) {
      this.log(e);
      this.unlock();
      return 9;
    }

    // For each video
    for(let video of videos) {
      // Process it
      try {
        await self.processVideo(video);
      } catch(e) {
        this.log(e);
      }

    }

    this.unlock();
    return 0;
  }

  // Function to create lock file
  lock() {
    fs.writeFileSync('dl.lock');
  }

  // Function to delete lock file
  unlock() {
    fs.unlinkSync('dl.lock');
  }

  // Function to get the format priorties from a file into an array
  readFormatPriority(file) {
    let formatPriority =  fs.readFileSync(file).toString().split("\n")
    for(let index in formatPriority) {
      if(!formatPriority[index].length) {
        formatPriority.pop(index);
      }
    }

    return formatPriority;
  }

  // Function to get the blacklist from a file into a key-value object for quick lookup
  readBlacklist(file) {
    let object = {};
    fs.readFileSync(file).toString().split("\n").forEach(function(line) {
      if(line.length) {
        object[line.trim()] = null;
      }
    });

    return object;
  }

  // Function to get channel id from user
  getChannelID(user) {
    return new Promise(function(resolve, reject) {
      // Query the API for users by their name
      twitchAPI.users.usersByName({users: user, limit: 1}, (err, res) => {
          if(err) {
            reject(err); return;
          }
          if(res && res.users && res.users.length) {
            resolve(res.users[0]._id); return;
          }

          reject('API call to find user returned without error, but no user found.');
      });
    });
  }

  // Function to actually downlad a video
  processVideo(videoData) {
    return new Promise(function(resolve, reject){
      // Get a prettier version of the video id
      let prettyID = self.getPrettyId(videoData._id);

      // Check if it's in the blacklist
      var inBlacklist = self.checkInBlacklist(prettyID);
      if(inBlacklist) {
        self.log('Skipped: ' + prettyID);
        resolve(2); return;
      }

      // Get the video metadata needed to download the video
      var metadata = self.processVideoData(videoData, prettyID);
      if(!metadata) {
        reject('Unable to get video metadata.'); return;
      }

      // Download the video
      self.log('Downloading video: ' + metadata.fileName + ' using format: ' + metadata.format);
      self.downloadVideo(metadata.format, metadata.fileName, videoData.url);
      self.addVideoToBlacklist(videoData._id, metadata.prettyID);

      resolve(1);
    });
  }

  // Function to check if the video is in the blacklist
  checkInBlacklist(id) {
    return (id.substring(1) in this.blacklist);
  }

  // Function to get a prettier version of the video id
  getPrettyId(id) {
    return id.substring(1);
  }

  // Function to process the video data, getting the required metadata
  processVideoData(videoData, prettyID) {
    let response = {};
    response.fileName = this.getFileName(videoData, prettyID);

    let info = this.getVideoInfo(videoData.url);
    if(!info) {
      this.log('Could not get video information for: ' + prettyID + '.');
      return false;
    }

    response.format = this.getVideoFormat(info.formats);
    if(!response.format) {
      this.log('Could not select format for: ' + prettyID + '.');
      return false;
    }

    return response;
  }

  // Function to add a video to the blacklist
  addVideoToBlacklist(id, prettyID) {
    fs.appendFileSync(this.blacklist, prettyID + "\n");
    this.blacklist[id] = true;
  }

  // Function to get the desired filename of the video
  getFileName(videoData, prettyID) {
    let dateFormat = moment(videoData.created_at).format('YYYY-MM-DD');

    return dateFormat + ' ' + prettyID + ' ' + videoData.title + '.mp4';
  }

  // Function to determine which video format to download
  getVideoFormat(sourceFormats) {
    let selectedFormat = false;
    let formats = [];

    // Create an easy array to loop through
    for(let format of sourceFormats) {
      formats[format.format_id] = format.format_id;
    }

    // Loop through each format
    for(let wantedFormat of this.priority) {
      // Check for the first hit and break on that
      if(formats.hasOwnProperty(wantedFormat)) {
        selectedFormat = wantedFormat;
        break;
      }
    }

    // If we got a direct hit, use it
    if(selectedFormat) {
      return selectedFormat;
    }

    // Try levenshtein distance
    var lastLevenshtein = Number.MAX_SAFE_INTEGER;
    for(let wantedFormat of this.priority) {
      for(let actualFormat in formats) {
        let newLevenshtein = levenshtein.get(wantedFormat, actualFormat);
        if(newLevenshtein < lastLevenshtein) {
          selectedFormat = actualFormat;
          lastLevenshtein = newLevenshtein;
        }
      }
    }



    if(selectedFormat) {
      this.log('Guessed format: ' + selectedFormat);
      return selectedFormat;
    }

    return false;
  }

  // Function to get the last 100 videos of a user by their channelID
  getVideos(channelID) {
    return new Promise(function(resolve, reject){
      // Query the API
      twitchAPI.channels.videos({channelID: channelID, limit: 100}, (err, res) => {
          if(err) {
            reject(err); return;
          }

          if(res && res.videos && res.videos.length){
            resolve(res.videos); return;
          }

          reject('API call to get videos of ' + channelID + ' returned without error, but no videos found.')
      });
    })
  }

  // Function to get the video information from the url, i.e. available formats
  getVideoInfo(url) {
    let result = spawnSync('youtube-dl', ['-J', url], {cwd: this.output}).stdout;

    if(result) {
      return JSON.parse(result);
    }

    return false;
  }

  // Function to actually download the video
  downloadVideo(selectedFormat, fileName, url) {
    spawnSync('youtube-dl', ['-f', selectedFormat, '-r', '2.8M', '-o', sanitize(fileName),  url], {cwd: this.output});
  }

  // Function to log when verbose
  log(...messages) {
    if(!this.verbose) {
      return;
    }

    for(let message of messages) {
      console.log(message);
    }
  }
}

module.exports = TwitchArchiver;
