# TwitchArchiver

A script to automate youtube-dl to archive a twitch channel.

Designed to be used with a cron.


## Setup
```
yarn install
```

## Building
```
yarn run build
```

## Compiled Usage
```
./bin/twitch-archiver-linux -u rapha -f priorityFile -b blacklist -o output -a API_KEY --verbose
```

## Source Usage
```
./twitch-archiver.js -u rapha -f priorityFile -b blacklist -o output -a API_KEY --verbose
```

## Example Priority File
```
1080p60
720p60
480p
```
## Example Blacklist File
```
316430487
316012032
315992457
315578520
315179362
```
