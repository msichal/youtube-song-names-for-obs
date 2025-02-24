// All of the tracked tabs.
let tabs = new Map();

// The last name that was downloaded.
let lastName;

// The default name format.
let nameFormat = '{title}';

// Try to get the stored format, if one exists.
chrome.storage.local.get('format', (result) => {
  if (result.format) {
    nameFormat = result.format;
  }
});

// And also listen to further changes.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.format) {
    nameFormat = changes.format.newValue;

    // Default the format if it's empty.
    if (nameFormat === '') {
      nameFormat = '{title}';
    }

    // If there is a song currently playing, redownload it.
    if (lastName) {
      download(lastName, true);
    }
  }
});

// Gets the url to a blob containing the given string.
function stringToUrl(s) {
  return URL.createObjectURL(new Blob([s], {type: "text/plain"}));
}

function getytid(url) {
  var r, rx = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;

  r = url.match(rx);
  return r[1];
}

// Given a name, if it's different than the last name, download it.
function download(tab, redownload) {
  if(typeof tab === 'string'){
    var name = tab;
  }
  else {
  var name = tab.name;
  }

  if (name  !== lastName || redownload) {
    lastName = name;

    // Interpolate the format.
    let formatted = nameFormat.replace(/\{title\}/g, name);
    var title = formatted;
    var artist='';

    name = name.replace(/^(\([0-9]+\) )/,'')
    nn=name.split(/[|-]+/)
//    let r = name.match(/^(.*)- ?([\p{L}\p{M}\p{Z}\p{P}\p{N}()' ]+)[| ]?.*$/)
    if(nn.length>1) {
      var title=nn[0].trim();
      var artist=nn[1].trim();
    } 

    // Download the name.
    // console.log("track: "+ title)
    chrome.downloads.download({url: stringToUrl(title), filename: 'Snip_Track.txt', conflictAction: 'overwrite'}, (downloadId) => {
      // Erase the download record, to not spam the user's downloads list.
      chrome.downloads.erase({id: downloadId});
    });

    if(artist != '') {
      // console.log("artist: "+artist)
      chrome.downloads.download({url: stringToUrl(artist), filename: 'Snip_Artist.txt', conflictAction: 'overwrite'}, (downloadId) => {
        // Erase the download record, to not spam the user's downloads list.
        chrome.downloads.erase({id: downloadId});
      });  
    }

    if(tab.api == "yt"){
      id = getytid(tab.url);
      // Download thumbnail.
      // console.log("thumb: "+"https://img.youtube.com/vi/"+id+"/mqdefault.jpg")
      chrome.downloads.download({url: "https://img.youtube.com/vi/"+id+"/mqdefault.jpg", filename: 'Snip_Artwork.jpg', conflictAction: 'overwrite'}, (downloadId) => {
        // Erase the download record, to not spam the user's downloads list.
        chrome.downloads.erase({id: downloadId});
      });
    }
  }
}

// Get the first tracked tab that has a known name and is audible, and download its name.
function update() {
  for (let tab of tabs.values()) {
    if (tab.name !== '' && tab.audible) {
      download(tab);
      return;
    }
  }

  download('');
}

// Map from urls to the file that handles them.
function getScript(url) {
  if (url.startsWith('https://www.youtube.com/watch')) {
    return 'youtube.js';
  } else if (url.startsWith('https://nightbot.tv/song_requests')) {
    return 'nightbot.js';
  } else if (url.startsWith('https://music.youtube.com/')) {
    return 'youtubemusic.js';
  }
}

// Convenience wrapper.
function isUrlSupported(url) {
  return !!getScript(url);
}

// Add a tracked tab.
function add(id, url, audible) {
  let script = getScript(url);

  if (script && !tabs.has(id)) {
    tabs.set(id, {name: '', audible: audible || false, url: url});

    chrome.tabs.executeScript(id, {file: script, runAt: "document_end"});

    update();
  }
}

// Remove a tracked tab.
function remove(id) {
  let tab = tabs.get(id);

  if (tab) {
    tabs.delete(id);

    update();
  }
}


// Set the name of a tracked tab.
function setTab(id, ntab) {
  let tab = tabs.get(id);

  if (tab) {
    tab.name = ntab.name;
    tab.api = ntab.api;
    tab.url = ntab.url;

    update();
  }
}


// Set the audible state of a tracked tab.
function setAudible(id, audible) {
  let tab = tabs.get(id);

  if (tab) {
    tab.audible = audible;

    update();
  }
}

function setURL(id, url) {
  let tab = tabs.get(id);

  if (tab) {
    tab.url = url;
  }
}


// Listen to name changes from the scripts running on the sites.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  setTab(sender.tab.id, request);
});

// Listen to tab updates.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined) {
    // If a tracked tab changed the url to something that is not tracked, stop tracking it.
    if (tabs.has(tabId)) {
      if (!isUrlSupported(changeInfo.url)) {
        remove(tabId);
      }
    } else {
      add(tabId, tab.url);
    }
  } else if (changeInfo.audible !== undefined) {
    setURL(tabId, tab.url);
    setAudible(tabId, changeInfo.audible);
  } else if (changeInfo.status === 'loading') {
    remove(tabId);
  }
});

// Listen to tabs being removed.
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  remove(tabId);
});

// Listen to history state changes.
// This is needed for sites that don't reload the tab when the user clicks on a video.
// Content scripts defined in the manifest are only loaded on tab loads, and thus do not work in this case.
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  add(details.tabId, details.url);
});

// Go over all of the open tabs and add whatever's relevant.
function initialize() {
  chrome.tabs.query({}, (tabs) => {
    for (let tab of tabs) {
      add(tab.id, tab.url, tab.audible);
    }
  });
}

// Start.
initialize();
