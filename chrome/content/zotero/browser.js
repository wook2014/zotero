/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright (c) 2006  Center for History and New Media
                        George Mason University, Fairfax, Virginia, USA
                        http://chnm.gmu.edu
    
    Licensed under the Educational Community License, Version 1.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at
    
    http://www.opensource.org/licenses/ecl1.php
    
    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
    
	
	Based on code from Greasemonkey and PiggyBank
	
	
    ***** END LICENSE BLOCK *****
*/

//
// Zotero Ingester Browser Functions
//

//////////////////////////////////////////////////////////////////////////////
//
// Zotero_Browser
//
//////////////////////////////////////////////////////////////////////////////

// Class to interface with the browser when ingesting data

var Zotero_Browser = new function() {
	this.init = init;
	this.scrapeThisPage = scrapeThisPage;
	this.annotatePage = annotatePage;
	this.toggleMode = toggleMode;
	this.chromeLoad = chromeLoad;
	this.chromeUnload = chromeUnload;
	this.contentLoad = contentLoad;
	this.contentHide = contentHide;
	this.tabClose = tabClose;
	this.resize = resize;
	this.updateStatus = updateStatus;
	this.finishScraping = finishScraping;
	this.itemDone = itemDone;
	
	this.tabbrowser = null;
	this.appcontent = null;
	this.statusImage = null;
	
	var _scrapePopupShowing = false;
	var _browserData = new Object();
	
	var _blacklist = [
		"googlesyndication.com",
		"doubleclick.net",
		"questionmarket.com",
		"atdmt.com"
	];
	
	var tools = {
		'zotero-annotate-tb-add':{
			cursor:"pointer",
			event:"click",
			callback:function(e) { _add("annotation", e) }
		},
		'zotero-annotate-tb-highlight':{
			cursor:"text",
			event:"mouseup",
			callback:function(e) { _add("highlight", e) }
		},
		'zotero-annotate-tb-unhighlight':{
			cursor:"text",
			event:"mouseup",
			callback:function(e) { _add("unhighlight", e) }
		}
	};

	//////////////////////////////////////////////////////////////////////////////
	//
	// Public Zotero_Browser methods
	//
	//////////////////////////////////////////////////////////////////////////////
	
	
	/*
	 * Initialize some variables and prepare event listeners for when chrome is done
	 * loading
	 */
	function init() {
		Zotero_Browser.browserData = new Object();
		Zotero_Browser._scrapePopupShowing = false;
		Zotero.Ingester.ProxyMonitor.init();
		Zotero.Ingester.MIMEHandler.init();
		Zotero.Translate.init();
		
		window.addEventListener("load",
			function(e) { Zotero_Browser.chromeLoad(e) }, false);
		window.addEventListener("unload",
			function(e) { Zotero_Browser.chromeUnload(e) }, false);
	}
	
	/*
	 * Scrapes a page (called when the capture icon is clicked); takes a collection
	 * ID as the argument
	 */
	function scrapeThisPage(saveLocation) {
		_getTabObject(this.tabbrowser.selectedBrowser).translate(saveLocation);
	}
	
	/*
	 * flags a page for annotation
	 */
	function annotatePage(id, browser) {
		if (browser) {
			var tab = _getTabObject(browser);
		}
		else {
			var tab = _getTabObject(this.tabbrowser.selectedBrowser);
		}
		tab.annotateNextLoad = true;
		tab.annotateID = id;
	}
	
	function toggleMode(toggleTool, ignoreOtherTools) {
		// make sure other tools are turned off
		if(!ignoreOtherTools) {
			for(var tool in tools) {
				if(tool != toggleTool && document.getElementById(tool).getAttribute("tool-active")) {
					toggleMode(tool, true);
				}
			}
		}
		
		if(!toggleTool) return;
		
		var body = Zotero_Browser.tabbrowser.selectedBrowser.contentDocument.getElementsByTagName("body")[0];
		var addElement = document.getElementById(toggleTool);
		
		if(addElement.getAttribute("tool-active")) {
			// turn off
			body.style.cursor = "auto";
			addElement.removeAttribute("tool-active");
			Zotero_Browser.tabbrowser.selectedBrowser.removeEventListener(tools[toggleTool].event, tools[toggleTool].callback, true);
		} else {
			body.style.cursor = tools[toggleTool].cursor;
			addElement.setAttribute("tool-active", "true");
			Zotero_Browser.tabbrowser.selectedBrowser.addEventListener(tools[toggleTool].event, tools[toggleTool].callback, true);
		}
	}
	
	/*
	 * called to hide the collection selection popup
	 */
	function hidePopup(collectionID) {
		_scrapePopupShowing = false;
	}

	/*
	 * called to show the collection selection popup
	 */
	function showPopup(collectionID, parentElement) {
		if(_scrapePopupShowing && parentElement.hasChildNodes()) {
			return false;	// Don't dynamically reload popups that are already showing
		}
		_scrapePopupShowing = true;
		parentElement.removeAllItems();
		
		if(collectionID == null) {	// show library
			var newItem = document.createElement("menuitem");
			newItem.setAttribute("label", Zotero.getString("pane.collections.library"));
			newItem.setAttribute("class", "menuitem-iconic zotero-scrape-popup-library");
			newItem.setAttribute("oncommand", 'Zotero_Browser.scrapeThisPage()');
			parentElement.appendChild(newItem);
		}
		
		var childrenList = Zotero.getCollections(collectionID);
		for(var i = 0; i < childrenList.length; i++) {
			if(childrenList[i].hasChildCollections()) {
				var newItem = document.createElement("menu");
				var subMenu = document.createElement("menupopup");
				subMenu.setAttribute("onpopupshowing", 'Zotero_Browser.showPopup("'+childrenList[i].getID()+'", this)');
				newItem.setAttribute("class", "menu-iconic zotero-scrape-popup-collection");
				newItem.appendChild(subMenu);
			} else {
				var newItem = document.createElement("menuitem");
				newItem.setAttribute("class", "menuitem-iconic zotero-scrape-popup-collection");
			}
			newItem.setAttribute("label", childrenList[i].getName());
			newItem.setAttribute("oncommand", 'Zotero_Browser.scrapeThisPage("'+childrenList[i].getID()+'")');
			
			parentElement.appendChild(newItem);
		}
		
		return true;
	}
	
	/*
	 * When chrome loads, register our event handlers with the appropriate interfaces
	 */
	function chromeLoad() {
		this.tabbrowser = document.getElementById("content");
		this.appcontent = document.getElementById("appcontent");
		this.statusImage = document.getElementById("zotero-status-image");
		
		// this gives us onLocationChange, for updating when tabs are switched/created
		this.tabbrowser.addEventListener("TabClose",
			function(e) { Zotero_Browser.tabClose(e) }, false);
		this.tabbrowser.addEventListener("TabSelect",
			function(e) { Zotero_Browser.updateStatus() }, false);
		// this is for pageshow, for updating the status of the book icon
		this.appcontent.addEventListener("pageshow",
			function(e) { Zotero_Browser.contentLoad(e) }, true);
		// this is for turning off the book icon when a user navigates away from a page
		this.appcontent.addEventListener("pagehide",
			function(e) { Zotero_Browser.contentHide(e) }, true);
		this.tabbrowser.addEventListener("resize",
			function(e) { Zotero_Browser.resize(e) }, false);
	}
	
	/*
	 * When chrome unloads, delete our document objects
	 */
	function chromeUnload() {
		delete Zotero_Browser.browserData;
	}
	
	/*
	 * An event handler called when a new document is loaded. Creates a new document
	 * object, and updates the status of the capture icon
	 */
	function contentLoad(event) {
		var isHTML = event.originalTarget instanceof HTMLDocument;
		
		if(isHTML) {
			var doc = event.originalTarget;
			var rootDoc = doc;
			
			// get the appropriate root document to check which browser we're on
			while(rootDoc.defaultView.frameElement) {
				rootDoc = rootDoc.defaultView.frameElement.ownerDocument;
			}
			
			// ignore blacklisted domains
			if(doc.domain) {
				for each(var blacklistedURL in _blacklist) {
					if(doc.domain.substr(doc.domain.length-blacklistedURL.length) == blacklistedURL) {
						Zotero.debug("Ignoring blacklisted URL "+doc.location);
						return;
					}
				}
			}
		}
		
		// Figure out what browser this contentDocument is associated with
		var browser;
		for(var i=0; i<this.tabbrowser.browsers.length; i++) {
			if(rootDoc == this.tabbrowser.browsers[i].contentDocument) {
				browser = this.tabbrowser.browsers[i];
				break;
			}
		}
		if(!browser) return;
		
		// get data object
		var tab = _getTabObject(browser);
		
		if(isHTML) {
			if(tab.annotateNextLoad) {
				// enable annotation
				tab.page.annotations = new Zotero.Annotations(browser, tab.annotateID);
			}
			
			// detect translators
			tab.detectTranslators(rootDoc, doc);
		}
		
		// clear annotateNextLoad
		if(tab.annotateNextLoad) {
			tab.annotateNextLoad = tab.annotateID = undefined;
		}
	}

	/*
	 * called to unregister Zotero icon, etc.
	 */
	function contentHide(event) {
		if(event.originalTarget instanceof HTMLDocument && !event.originalTarget.defaultView.frameElement) {
			var doc = event.originalTarget;
			
			// Figure out what browser this contentDocument is associated with
			var browser;
			for(var i=0; i<this.tabbrowser.browsers.length; i++) {
				if(doc == this.tabbrowser.browsers[i].contentDocument) {
					browser = this.tabbrowser.browsers[i];
					break;
				}
			}
			
			// clear data object
			var tab = _getTabObject(browser);
			if(!tab) return;
			
			// save annotations
			if(tab.page && tab.page.annotations) tab.page.annotations.save();
			
			tab.clear();
			
			// update status
			if(this.tabbrowser.selectedBrowser == browser) {
				updateStatus();
			}
		}
	}
	
	/*
	 * called when a tab is closed
	 */
	function tabClose(event) {
		// To execute if document object does not exist
		_deleteTabObject(event.target.linkedBrowser);
		toggleMode(null);
	}
	
	/*
	 * called when the window is resized
	 */
	function resize(event) {
		var tab = _getTabObject(this.tabbrowser.selectedBrowser);
		if(!tab.page.annotations) return;
		
		tab.page.annotations.refresh();
	}
	
	/*
	 * Updates the status of the capture icon to reflect the scrapability or lack
	 * thereof of the current page
	 */
	function updateStatus() {
		var tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		
		var captureIcon = tab.getCaptureIcon();
		if(captureIcon) {
			Zotero_Browser.statusImage.src = captureIcon;
			Zotero_Browser.statusImage.hidden = false;
		} else {
			Zotero_Browser.statusImage.hidden = true;
		}
		
		// set annotation bar status
		if(tab.page.annotations) {
			document.getElementById('zotero-annotate-tb').hidden = false;
			toggleMode();
		} else {
			document.getElementById('zotero-annotate-tb').hidden = true;
		}
	}
	
	/*
	 * Callback to be executed when scraping is complete
	 */
	function finishScraping(obj, returnValue, collection) {
		if(!returnValue) {
			Zotero_Browser.Progress.changeHeadline(Zotero.getString("ingester.scrapeError"));
			Zotero_Browser.Progress.addDescription(Zotero.getString("ingester.scrapeErrorDescription"));
		}
		
		Zotero_Browser.Progress.fade();
	}
	
	
	/*
	 * Callback to be executed when an item has been finished
	 */
	function itemDone(obj, item, collection) {
		var title = item.getField("title");
		var icon = item.getImageSrc();
		Zotero_Browser.Progress.addLines([title], [icon]);
		
		// add item to collection, if one was specified
		if(collection) {
			collection.addItem(item.getID());
		}
	}
	
	//////////////////////////////////////////////////////////////////////////////
	//
	// Private Zotero_Browser methods
	//
	//////////////////////////////////////////////////////////////////////////////
	
	/*
	 * Gets a data object given a browser window object
	 * 
	 * NOTE: Browser objects are associated with document objects via keys generated
	 * from the time the browser object is opened. I'm not sure if this is the
	 * appropriate mechanism for handling this, but it's what PiggyBank used and it
	 * appears to work.
	 *
	 * Currently, the data object contains only one property: "translators," which
	 * is an array of translators that should work with the given page as returned
	 * from Zotero.Translate.getTranslator()
	 */
	function _getTabObject(browser) {
		if(!browser) return false;
		try {
			var key = browser.getAttribute("zotero-key");
			if(_browserData[key]) {
				return _browserData[key];
			}
		} finally {
			if(!key) {
				var key = (new Date()).getTime();
				browser.setAttribute("zotero-key", key);
				return (_browserData[key] = new Zotero_Browser.Tab(browser));
			}
		}
		return false;
	}
	
	/*
	 * Deletes the document object associated with a given browser window object
	 */
	function _deleteTabObject(browser) {
		if(!browser) return false;
		try {
			var key = browser.getAttribute("zotero-key");
			if(_browserData[key]) {
				delete _browserData[key];
				return true;
			}
		} finally {}
		return false;
	}
	
	/*
	 * adds an annotation
	 */
	 function _add(type, e) {
		var tab = _getTabObject(Zotero_Browser.tabbrowser.selectedBrowser);
		
		if(type == "annotation") {
			// ignore click if it's on an existing annotation
			if(e.target.getAttribute("zotero-annotation")) return;
			
			var annotation = tab.page.annotations.createAnnotation();
			annotation.initWithEvent(e);
			
			// disable add mode, now that we've used it
			toggleMode();
		} else {
			try {
				var selection = Zotero_Browser.tabbrowser.selectedBrowser.contentWindow.getSelection();
			} catch(err) {
				return;
			}
			if(selection.isCollapsed) return;
			
			if(type == "highlight") {
	 			tab.page.annotations.createHighlight(selection.getRangeAt(0));
			} else if(type == "unhighlight") {
	 			tab.page.annotations.unhighlight(selection.getRangeAt(0));
			}
			
			selection.removeAllRanges();
		}
		
		// stop propagation
		e.stopPropagation();
		e.preventDefault();
	 }
}


//////////////////////////////////////////////////////////////////////////////
//
// Zotero_Browser.Tab
//
//////////////////////////////////////////////////////////////////////////////

Zotero_Browser.Tab = function(browser) {
	this.browser = browser;
	this.page = new Object();
}

/*
 * clears page-specific information
 */
Zotero_Browser.Tab.prototype.clear = function() {
	delete this.page;
	this.page = new Object();
}

/*
 * detects translators for this browser object
 */
Zotero_Browser.Tab.prototype.detectTranslators = function(rootDoc, doc) {
	// if there's already a scrapable page in the browser window, and it's
	// still there, ensure it is actually part of the page, then return
	if(this.page.translators && this.page.translators.length && this.page.document.location) {
		if(this._searchFrames(rootDoc, this.page.document)) {
			return;
		} else {
			this.page.document = null;
		}
	}
	
	// get translators
	var me = this;
	
	var translate = new Zotero.Translate("web");
	translate.setDocument(doc);
	translate.setHandler("translators", function(obj, item) { me._translatorsAvailable(obj, item) });
	var translators = translate.getTranslators();
}


/*
 * searches for a document in all of the frames of a given document
 */
Zotero_Browser.Tab.prototype._searchFrames = function(rootDoc, searchDoc) {
	var frames = rootDoc.getElementsByTagName("frame");
	for each(var frame in frames) {
		if(frame.contentDocument &&
		  (frame.contentDocument == searchDoc ||
		  this._searchFrames(frame.contentDocument, searchDoc))) {
			return true;
		}
	}
	
	return false;
}

/*
 * translate a page, saving in saveLocation
 */
Zotero_Browser.Tab.prototype.translate = function(saveLocation) {
	if(this.page.translators && this.page.translators.length) {
		Zotero_Browser.Progress.show();
		
		if(saveLocation) {
			saveLocation = Zotero.Collections.get(saveLocation);
		} else { // save to currently selected collection, if a collection is selected
			try {
				saveLocation = ZoteroPane.getSelectedCollection();
			} catch(e) {}
		}
		
		var me = this;
		
		if(!this.page.hasBeenTranslated) {
			// use first translator available
			this.page.translate.setTranslator(this.page.translators[0]);
			this.page.translate.setHandler("select", me._selectItems);
			this.page.translate.setHandler("itemDone", function(obj, item) { Zotero_Browser.itemDone(obj, item, saveLocation) });
			this.page.translate.setHandler("done", function(obj, item) { Zotero_Browser.finishScraping(obj, item, saveLocation) });
			this.page.hasBeenTranslated = true;
		}
		
		this.page.translate.translate();
	}
}

/*
 * returns the URL of the image representing the translator to be called on the
 * current page, or false if the page cannot be scraped
 */
Zotero_Browser.Tab.prototype.getCaptureIcon = function() {
	if(this.page.translators && this.page.translators.length) {
		var itemType = this.page.translators[0].itemType;
		if(itemType == "multiple") {
			// Use folder icon for multiple types, for now
			return "chrome://zotero/skin/treesource-collection.png";
		} else {
			return Zotero.ItemTypes.getImageSrc(itemType);
		}
	}
	
	return false;
}

/**********CALLBACKS**********/

/*
 * called when a user is supposed to select items
 */
Zotero_Browser.Tab.prototype._selectItems = function(obj, itemList) {
	// this is kinda ugly, mozillazine made me do it! honest!
	var io = { dataIn:itemList, dataOut:null }
	var newDialog = window.openDialog("chrome://zotero/content/ingester/selectitems.xul",
		"_blank","chrome,modal,centerscreen,resizable=yes", io);
	
	if(!io.dataOut) {	// user selected no items, so kill the progress indicatior
		Zotero_Browser.Progress.kill();
	}
	
	return io.dataOut;
}

/*
 * called when translators are available
 */
Zotero_Browser.Tab.prototype._translatorsAvailable = function(translate, translators) {
	if(translators && translators.length) {
		this.page.translate = translate;
		this.page.translators = translators;
		this.page.document = translate.document;
	}
	
	Zotero_Browser.updateStatus();
}

//////////////////////////////////////////////////////////////////////////////
//
// Zotero_Browser.Progress
//
//////////////////////////////////////////////////////////////////////////////

// Handles the display of a div showing progress in scraping
Zotero_Browser.Progress = new function() {
	var _progressWindow;
	
	var _windowLoaded = false;
	var _windowLoading = false;
	// keep track of all of these things in case they're called before we're
	// done loading the progress window
	var _loadDescription = null;
	var _loadLines = new Array();
	var _loadIcons = new Array();
	var _loadHeadline = Zotero.getString("ingester.scraping");
	
	this.show = show;
	this.changeHeadline = changeHeadline;
	this.addLines = addLines;
	this.addDescription = addDescription;
	this.fade = fade;
	this.kill = kill;
	
	function show() {
		if(_windowLoading || _windowLoaded) {	// already loading or loaded
			return false;
		}
		_progressWindow = window.openDialog("chrome://zotero/chrome/ingester/progress.xul",
		                                    "", "chrome,dialog=no,titlebar=no,popup=yes");
		_progressWindow.addEventListener("load", _onWindowLoaded, false);
		_windowLoading = true;
		
		return true;
	}
	
	function changeHeadline(headline) {
		if(_windowLoaded) {
			_progressWindow.document.getElementById("zotero-progress-text-headline").value = headline;
		} else {
			_loadHeadline = headline;
		}
	}
	
	function addLines(label, icon) {
		if(_windowLoaded) {
			for(i in label) {
				var newLabel = _progressWindow.document.createElement("label");
				newLabel.setAttribute("class", "zotero-progress-item-label");
				newLabel.setAttribute("crop", "end");
				newLabel.setAttribute("value", label[i]);
				
				var newImage = _progressWindow.document.createElement("image");
				newImage.setAttribute("class", "zotero-progress-item-icon");
				newImage.setAttribute("src", icon[i]);
				
				var newHB = _progressWindow.document.createElement("hbox");
				newHB.setAttribute("class", "zotero-progress-item-hbox");
				newHB.setAttribute("valign", "center");
				newHB.appendChild(newImage);
				newHB.appendChild(newLabel);
				
				_progressWindow.document.getElementById("zotero-progress-text-box").appendChild(newHB);
			}
			
			_move();
		} else {
			_loadLines = _loadLines.concat(label);
			_loadIcons = _loadIcons.concat(icon);
		}
	}
	
	function addDescription(text) {
		if(_windowLoaded) {
			var newHB = _progressWindow.document.createElement("hbox");
			newHB.setAttribute("class", "zotero-progress-item-hbox");
			var newDescription = _progressWindow.document.createElement("description");
			newDescription.setAttribute("class", "zotero-progress-description");
			var newText = _progressWindow.document.createTextNode(text);
			
			newDescription.appendChild(newText);
			newHB.appendChild(newDescription);
			_progressWindow.document.getElementById("zotero-progress-text-box").appendChild(newHB);
			
			_move();
		} else {
			_loadDescription = text;
		}
	}
	
	function fade() {
		if(_windowLoaded || _windowLoading) {
			setTimeout(_timeout, 2500);
		}
	}
	
	function kill() {
		_windowLoaded = false;
		_windowLoading = false;
		try {
			_progressWindow.close();
		} catch(ex) {}
	}
	
	function _onWindowLoaded() {
		_windowLoading = false;
		_windowLoaded = true;
		
		_move();
		// do things we delayed because the window was loading
		changeHeadline(_loadHeadline);
		addLines(_loadLines, _loadIcons);
		if(_loadDescription) {
			addDescription(_loadDescription);
		}
		
		// reset parameters
		_loadDescription = null;
		_loadLines = new Array();
		_loadIcons = new Array();
		_loadHeadline = Zotero.getString("ingester.scraping")
	}
	
	function _move() {
		_progressWindow.sizeToContent();
		_progressWindow.moveTo(
			window.screenX + window.innerWidth - _progressWindow.outerWidth - 30,
			window.screenY + window.innerHeight - _progressWindow.outerHeight - 10
		);
	}
	
	function _timeout() {
		kill();	// could check to see if we're really supposed to fade yet
				// (in case multiple scrapers are operating at once)
	}
}

Zotero_Browser.init();