var WsVodkaFB_OTT = {};

WsVodkaFB_OTT.get = function (sendParam, fCallback, fCallbackStatic, methodName, fReturnCallback, doRetry, errorCodes) {
	var href = location.href;
	var dir = href.substring(0, href.lastIndexOf('/')) + "/";
	var url = dir + "a_proxy/htService.asmx" + "/" + methodName;

	if (GlobalUtils.IsHisense) {
		//url = "https://hisense.nexttv.co.il/a_proxy/htService.asmx" + "/" + methodName;
	}
	else if (GlobalUtils.IsSamsung) {
		url = "https://auxserviceplay.hot.net.il/prod_n/a_proxy/htService.asmx" + "/" + methodName;
	}
	else if (GlobalUtils.IsLG) {
		//url = "https://lg.nexttv.co.il/a_proxy/htService.asmx" + "/" + methodName;
	}
	else if (GlobalUtils.IsAndroid) {
		//url = "https://android.nexttv.co.il/a_proxy/htService.asmx" + "/" + methodName;
	}
	else if (GlobalUtils.IsPC) {
		//url = "http://192.168.1.38/smart_tv/a_proxy/htService.asmx" + "/" + methodName;
	}

	//url = "http://192.168.1.38/smart_tv/a_proxy/htService.asmx" + "/" + methodName;	
	if (sendParam == null) { sendParam = {}; }

	$.ajax({
		url: url,
		type: "POST",
		data: JSON.stringify(sendParam),
		contentType: "application/json; charset=utf-8",
		dataType: "json",
		timeout: GlobalUtils.webServiceTimeOut, // sets timeout to 40 seconds
		async: true,
		cache: true,

		success: function (data, textStatus, jqXHR) {
			if (data != null && data.d != null && data.d != "") { //check type of d == string ???? 
				try {
					var jsonError = JSON.parse(data.d);
					var popupError = null;

					// Nagra Error
					if (jsonError != null && jsonError.resultCode != null && jsonError.resultCode != 0) {
						if (errorCodes != null && errorCodes.MethodID != null) {
							GlobalUtils.handleNagraErrors(errorCodes, function (nagraPopupError) {
								if (fCallbackStatic != null) {
									fCallbackStatic(data, nagraPopupError, fReturnCallback);
								}
							});
						}
						else if (fCallbackStatic != null) {
							fCallbackStatic(data, popupError, fReturnCallback);
						}

						// Send Log
						GlobalUtils.Loger("555", jqXHR.status, jqXHR.status, jqXHR.statusText, function () { console.error("Send Error Log - Success"); }, function () { console.error("Send Error Log - Error"); });
					}
					// Hot WS Error
					else if (jsonError != null && jsonError.err != null && jsonError.err.id != null && jsonError.err.reason != null && jsonError.err.content != null) { // if 204 ???
						if (errorCodes != null && errorCodes.MethodID != null) {
							var reason = jsonError.err.reason ? "-" + jsonError.err.reason : "";
							body = jsonError.err.content + "<br><br><div style='font-size:32px;'>" + "מספר שגיאה <span style='font-size:24px;'>" + errorCodes.MethodID + "-" + jsonError.err.id + reason + "</span></div>";
							popupError = function () { GlobalUtils.ShowPopupMessage("", body, false, null, null, 0, null, null, null, null, null, null, null, true); };
						}

						if (fCallbackStatic != null) {
							fCallbackStatic(data, popupError, fReturnCallback);
						}
					}
					// Success
					else {
						if (fCallback != null) {
							fCallback(data.d, fReturnCallback);
						}
					}

				}
				catch (e) {
					//console.error(methodName + "catch error - do success callback");
					//console.error(methodName + " e ", e);
					//console.error(methodName + " data.d catch ", data.d);
					// Success
					if (fCallback != null) {
						fCallback(data.d, fReturnCallback);
					}
				}
			}
			else {
				// Success
				if (fCallback != null) {
					fCallback("", fReturnCallback);
				}
			}
		},
		error: function (result, _textStatus) {
			//console.error(methodName, " error11111", result, _textStatus, methodName);		

			switch (result.status) {
				case 503:
					GlobalUtils.SystemErrorExit(503);
					break;
				case 404:
					console.error("result.status", result.status);
					break;
				case 0:
					//console.error("result.status", result.status);
					break;
			}

			GlobalUtils.showLoadingLogo(false, { "LoaderId": "dvLoader", "LoaderFrom": " WsVodkaFB error " + url });

			if (fCallbackStatic != null) {
				fCallbackStatic(result, null, fReturnCallback);
			}

		}
	});
}


WsVodkaFB_OTT.GetUniqeURL = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getUniqeURL");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getUniqeURL", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.GetUniqeURL_StartOver = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getUniqeURL");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getUniqeURL_StartOver", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.GetEntitlements = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getEntitlements");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getEntitlements", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.LoginHT = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("loginHT_HotApp");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "loginHT_HotApp", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.loginHTSmsCode = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("loginHTSmsCode_HotApp");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "loginHTSmsCode_HotApp", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.updateUiUser = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("updateUiUser");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "updateUiUser", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.ChooseAccountTologin = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("chooseAccountTologin");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "chooseAccountTologin", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.AgeRestrictionCheck = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("ageRestrictionCheck");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "ageRestrictionCheck", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.AgeRestrictionValidate = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("ageRestrictionValidate");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "ageRestrictionValidate", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.GetSavedAssets = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getSavedAssets");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getSavedAssets", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.SavedAssetsAdd = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("savedAssetsAdd");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "savedAssetsAdd", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.GetFavAssets = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getFavAssets");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getFavAssets", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.FavAssetsAdd = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("favAssetsAdd");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "favAssetsAdd", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.FavAssetsRemove = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("favAssetsRemove");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "favAssetsRemove", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.getAllCASNsByAccount = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getAllCASNsByAccount");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getAllCASNsByAccount", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.updateAppFriendlyName = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("updateAppFriendlyName");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "updateAppFriendlyName", fReturnCallback, doRetry, errorCodes);
}
/********************************* BTV START *********************************/
WsVodkaFB_OTT.GetProgrammes = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getProgrammes");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getProgrammes", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.GetCatchUpProgrammes = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("GetCatchUpProgrammes");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "GetCatchUpProgrammes", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.GetDataVersion = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getDataVersion");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getDataVersion", fReturnCallback, doRetry, errorCodes);
}
WsVodkaFB_OTT.GetVodDataVersion = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("getVodDataVersion");
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getVodDataVersion", fReturnCallback, doRetry, errorCodes);
}
/********************************* BTV END *********************************/
WsVodkaFB.Loger = function (eventID, ErrorNumber, SystemError, ErrorText, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
	var errorCodes = GlobalUtils.getErrorCodes("loger");
	var httpCode = SystemError;
	if (errorCodes != null && errorCodes.MethodID != null && errorCodes.MethodID != GlobalUtils.Config.DefaultErrorCode) {
		httpCode = errorCodes.MethodID;
	}

	var ACN = GlobalUtils.NGobjRes.ACN;

	if (!ACN) { ACN = 0; }

	var encryptedData = "";
	if (GlobalUtils.NGobjRes != null && GlobalUtils.NGobjRes.encryptedData != null) {
		encryptedData = GlobalUtils.NGobjRes.encryptedData;
	}

	var sendParam = { 'eventID': eventID, 'ErrorNumber': ErrorNumber, 'SystemError': httpCode, 'ErrorText': ErrorText, 'encryptedData': encryptedData, 'deviceId': GlobalUtils.tv_api.GetDeviceID(), 'ACN': ACN };

	WsVodkaFB.get(sendParam, fCallback, fCallbackStatic, "loger", fReturnCallback, doRetry, errorCodes);
}
/********************************************************************** nPvr **********************************************************************/
WsVodkaFB_OTT.DeleteSeries = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "deleteSeries", fReturnCallback, false, null);
}

WsVodkaFB_OTT.DeleteEvent = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "deleteEvent", fReturnCallback, false, null);
}

WsVodkaFB_OTT.RecordSeries = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "recordSeries", fReturnCallback, false, null);
}

WsVodkaFB_OTT.RecordEvent = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "recordEvent", fReturnCallback, false, null);
}

WsVodkaFB_OTT.GetRecordings = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getRecordings", fReturnCallback, false, null);
}

WsVodkaFB_OTT.UpdateFreeSpace = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "updateFreeSpace", fReturnCallback, false, null);
}

WsVodkaFB_OTT.setUserPinCode = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "setUserPinCode", fReturnCallback, false, null);
}

WsVodkaFB_OTT.GetCatchupKidumim = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "GetCatchupKidumim", fReturnCallback, false, null);
}
/**********************************************************************  HOT MUSIC START ******************************************************************/
WsVodkaFB_OTT.HMLogin = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "HMLogin", fReturnCallback, false, null);
}
WsVodkaFB_OTT.GetChannelMetadata = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "GetChannelMetadata", fReturnCallback, false, null);
}
WsVodkaFB_OTT.SpecialGet = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "SpecialGet", fReturnCallback, false, null);
}
WsVodkaFB_OTT.MarqueeGet = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "MarqueeGet", fReturnCallback, false, null);
}
/**********************************************************************  HOT MUSIC END ******************************************************************/


WsVodkaFB_OTT.frameBridge = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {

	var sendParam = { 'methodUrl': data.methodUrl, 'data': data.sendParam, 'methodType': data.methodType, encryptedData: data.encryptedData };


	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "frameBridge", fReturnCallback, false, null);
}


WsVodkaFB_OTT.OutsideCalls = function (url, fCallback, fCallbackStatic, type, dataType, contentType) {

	$.ajax({
		url: url,
		type: "GET",
		dataType: "json",
		timeout: GlobalUtils.webServiceTimeOut, // sets timeout to 40 seconds
		success: function (data, textStatus, jqXHR) {
			if (data != null && data.d != null && data.d != "") {
				try {
					var resVal = JSON.parse(data.d);
					if (fCallback != null) { fCallback(resVal); }
				}
				catch (e) {
					if (fCallbackStatic != null) { fCallbackStatic(e); }
				}
			}
			else if (data != null) {
				if (fCallback != null) { fCallback(data); }
			}
		},
		error: function (result) {
			if (result.status == 200) {
				fCallback(result.responseText);
			}
			else {
				if (fCallbackStatic != null) { fCallbackStatic(result); }
			}
		}
	});

}
WsVodkaFB_OTT.getUniqueUrlClient = function (params, fCallback, fCallbackStatic) {
	try {
		var streamURL = "";
		var Profile = "";
		var hotHost;
		var PropUrl = params.PropUrl;
		var appName = params.appName;
		var DeviceType = params.DeviceType;
		var LiveDubPlaying = params.LiveDubPlaying;
		var PlayUrlType = params.PlayUrlType;
		var IsHotStreamer = params.IsHotStreamer;
		var isTrailer = params.isTrailer;
		var isClearForceNeeded = params.isClearForceNeeded;

		if (appName == "CommercialChannel") {
			streamURL = `https://app.hot.net.il/sdash/BLK753/index.mpd/Manifest?device=CLRDIAGNOSTIC`;
			hotHost = "vodnolimit.cdnhot.co.il";
		} else if (appName == "RADIO" || appName == "HOTMUSIC") {
			var apphotDomain = "https://app.hot.net.il";
			var liverdDomain = "https://liverd.cdnhot.co.il";
			var livehmDomain = "https://livehmc.cdnhot.co.il";

			try {
				var isHm = PropUrl.indexOf("https://livehmc.cdnhot.co.il") > -1;
				if (isHm) {

					hotHost = "livehmc.cdnhot.co.il";
					streamURL = PropUrl.replace(livehmDomain, apphotDomain);
				} else {

					hotHost = "liverd.cdnhot.co.il";
					streamURL = PropUrl.replace(liverdDomain, apphotDomain);
				}
			}
			catch (e) {

			}

		}

		else if (appName == "VOD") {
			if (DeviceType == "HISENSE") {
				if (isTrailer) {
					Profile = "DASHTRAILER";
				}
				else {
					Profile = "NAGRA-PR-MAIN-VOD-CDN";
				}
				//url = "https://vodnolimit.cdnhot.co.il/sdash/" + PropUrl + "/5.mpd/Manifest?device=" + Profile;
				hotHost = "https://vodnolimit.cdnhot.co.il";
				streamURL = GlobalUtils.NGobjRes.apiGateway + "/sdash/" + PropUrl + "/5.mpd/Manifest?&device=" + Profile;

			}
			else if (DeviceType == "SAMSUNG") {
				if (NLisCdnActive) {

					if (isTrailer) {
						Profile = "DASHTRAILER";
					}
					else {
						Profile = "NAGRA-PR-MAIN-VOD-CDN";
					}
					url = "https://vodnolimit.cdnhot.co.il/sdash/" + PropUrl + "/5.mpd/Manifest?device=" + Profile;
				}
				else {
					url = NagraUrl + "/abr_vod/" + PropUrl + "/NAGRA-PR-MAIN-VOD";
				}
			}
			else if (DeviceType == "ANDROID" || DeviceType == "LG") {
				if (isTrailer) {
					Profile = "DASHTRAILER";
				}
				else {
					Profile = "NAGRA-WV-MAIN-VOD-CDN";
				}
				hotHost = "vodnolimit.cdnhot.co.il";

				//url = "https://vodnolimit.cdnhot.co.il/sdash/" + PropUrl + "/5.mpd/Manifest?device=" + Profile;
				streamURL = GlobalUtils.NGobjRes.apiGateway + "/sdash/" + PropUrl + "/5.mpd/Manifest?&device=" + Profile;

				//CLRVODDASHUN        
				//NAGRA-WV-MAIN-VOD-CDN            


			}
		}
		else if (appName == "LIVE") {

			if (DeviceType == "HISENSE" || DeviceType == "LG" || DeviceType == "ANDROID" || DeviceType == "SAMSUNG") {
				if (DeviceType == "HISENSE") {
					Profile = "NAGRA-PR-THUM-LIVE";

					if (LiveDubPlaying != "" && LiveDubPlaying != "und") {
						Profile = "NAGRA-PR-THUM-LIVE-" + LiveDubPlaying.toUpperCase();
					}
				}
				else if (DeviceType == "ANDROID" || DeviceType == "LG") {
					Profile = "NAGRA-WV-THUM-LIVE";
					if (LiveDubPlaying != "" && LiveDubPlaying != "und") {
						Profile = "NAGRA-WV-THUM-LIVE-" + LiveDubPlaying.toUpperCase();
					}

					if (PlayUrlType == "1") {
						if (DeviceType == "ANDROID" && IsHotStreamer) // to return http and not https for android streamers
						{
							hotHost = "livedllcsmart.cdnhot.co.il";
							

							profile = "NAGRA-WV-LLC-2B";
							if (isClearForceNeeded) {
								profile = "NAGRA-CLR-LLC-2B";
							}
							//url = "https://livedllcsmart.cdnhot.co.il/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=NAGRA-WV-LLC-2B";
							streamURL = GlobalUtils.NGobjRes.apiGateway + "/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=" + profile;

						}
						else {
							hotHost = "livedllc.cdnhot.co.il";
							profile = "NAGRA-WV-LLC-2B";
							if (isClearForceNeeded) {
								profile = "NAGRA-CLR-LLC-2B";
							}
							//url = "https://livedllc.cdnhot.co.il/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=NAGRA-WV-LLC-2B";
							streamURL = GlobalUtils.NGobjRes.apiGateway + "/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=" + profile;

						}

					} else { // not llc
						if (DeviceType == "ANDROID" && IsHotStreamer) // to return http and not https for android streamers
						{
							if (isClearForceNeeded) {
								Profile = "NAGRA-CLR-THUM-LIVE";

							}
							hotHost = "liveplaytv.cdnhot.co.il";

							//url = "https://liveplaytv.cdnhot.co.il/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=" + Profile;
							streamURL = GlobalUtils.NGobjRes.apiGateway + "/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=" + Profile;

						}
						else {
							if (DeviceType == "ANDROID" && isClearForceNeeded) {
								Profile = "NAGRA-CLR-THUM-LIVE";
							}
							hotHost = "livenolimit.cdnhot.co.il";

							//url = "https://livenolimit.cdnhot.co.il/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=" + Profile;
							streamURL = GlobalUtils.NGobjRes.apiGateway + "/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=" + Profile;

						}
					}
				}

				else if (DeviceType == "SAMSUNG") {
					Profile = "NAGRA-PR-THUM-LIVE";
					if (LiveDubPlaying != "" && LiveDubPlaying != "und") {
						Profile = "NAGRA-PR-THUM-LIVE-" + LiveDubPlaying.toUpperCase();
					}

					if (PlayUrlType == "1") {
						url = "https://livedllc.cdnhot.co.il/sdash/LIVE$" + PropUrl + "/index.mpd/Manifest?start=LIVE&end=END&device=NAGRA-PR-LLC-2B";
						//text = MakeWebRequest(url, "", "GET");
						//return text;
					}
				}


				//text = MakeWebRequest(url, "", "GET");
			}

		}
		else if (appName == "PVR") {

			Profile = "NAGRA-PR-THUM-LIVE";


			if (LiveDubPlaying != "" && LiveDubPlaying != "und") {
				Profile = "NAGRA-PR-THUM-LIVE-" + LiveDubPlaying.toUpperCase();
			}

			if (DeviceType == "HISENSE") {
				url = "https://npvrnolimit.cdnhot.co.il/sdash/NagraLocker_" + PropUrl + "_abr/index.mpd/Manifest?device=" + Profile;
			}
			else if (DeviceType == "SAMSUNG") {
				url = "https://npvrnolimit.cdnhot.co.il/sdash/NagraLocker_" + PropUrl + "_abr/index.mpd/Manifest?device=" + Profile;
			}
			else if (DeviceType == "LG") {
				Profile = "NAGRA-WV-THUM-LIVE";

				if (LiveDubPlaying != "" && LiveDubPlaying != "und") {
					Profile = "NAGRA-WV-THUM-LIVE-" + LiveDubPlaying.toUpperCase();
				}
				url = "https://npvrnolimit.cdnhot.co.il/sdash/NagraLocker_" + PropUrl + "_abr/index.mpd/Manifest?device=" + Profile;
			}
			else if (DeviceType == "ANDROID") {
				Profile = "NAGRA-WV-THUM-LIVE";

				if (LiveDubPlaying != "" && LiveDubPlaying != "und") {
					Profile = "NAGRA-WV-THUM-LIVE-" + LiveDubPlaying.toUpperCase();
				}

				//url = "https://npvrnolimit.cdnhot.co.il/sdash/NagraLocker_" + PropUrl + "_abr/index.mpd/Manifest?device=" + Profile;

				hotHost = "npvrnolimit.cdnhot.co.il";

				streamURL = GlobalUtils.NGobjRes.apiGateway + "/sdash/NagraLocker_" + PropUrl + "_abr/index.mpd/Manifest?device=" + Profile;
			}



		}


		//var url = GlobalUtils.NGobjRes.apiGateway +"/sdash/LIVE$Keshet_HD_20311/index.mpd/Manifest?start=LIVE&end=END&device=NAGRA-WV-THUM-LIVE";
		

		var chromeVersion = getChromeVersion();
		var requestid = createNewGuid();

		var headersObj = {
			"x-hot-host": hotHost,
			"client-Token": GlobalUtils.NGobjRes.ClientToken,
			"tokenSession": 123456,
			"x-hot-frontuiversion": GlobalUtils.NGobjRes.WebSiteVersion,
			"x-hot-fwversion": GlobalUtils.AndroidVer,
			"x-hot-browserversion": chromeVersion,
			"x-hot-esn": GlobalUtils.tv_api.GetDeviceID(),
			"x-hot-tokensession": "TBD",
			"x-hot-applicationname": "ANDROID-HOT",
			"x-hot-platform": "NOSTB",
			"x-hot-requestid": requestid,
			"x-hot-drmid": "Widevine",
			"x-hot-context": '{"regionCode": "IL"}'


		};

		$.ajax({
			url: streamURL,
			type: "GET",
			dataType: "json",
			headers: headersObj,
			timeout: GlobalUtils.webServiceTimeOut, // sets timeout to 40 seconds
			success: function (data, textStatus, jqXHR) {
				if (data != null && data.d != null && data.d != "") {
					try {
						var resVal = JSON.parse(data.d);
						if (fCallback != null) { fCallback(resVal); }
					}
					catch (e) {
						if (fCallbackStatic != null) { fCallbackStatic(e); }
					}
				}
				else if (data != null) {
					if (fCallback != null) { fCallback(data); }
				}
			},
			error: function (result) {
				if (result.status == 200) {
					fCallback(result.responseText);
				}
				else {
					if (fCallbackStatic != null) { fCallbackStatic(result); }
				}
			}
		});
	}
	catch (e) {

    }
}

WsVodkaFB_OTT.GetUniqeURL_StartOverClient = function (params, fCallback, fCallbackStatic) {
	try {
		var streamURL = "";
		var Profile = "NAGRA-WV-THUM-LIVE";
		var hotHost;
		var NetworkLocation = params.NetworkLocation;
		var DeviceType = params.DeviceType;
		var StartTime = params.StartTime;
		var EndTime = params.EndTime;
		var LiveDubPlaying = params.LiveDubPlaying;
		

			if (DeviceType == "HISENSE" || DeviceType == "SAMSUNG") {
				Profile = "NAGRA-PR-THUM-LIVE";
				if (LiveDubPlaying != "" && LiveDubPlaying != "und") {
					Profile = "NAGRA-PR-THUM-LIVE-" + LiveDubPlaying.toUpperCase();
				}
			}
			else {
				if (LiveDubPlaying != "" && LiveDubPlaying != "und") {
					Profile = "NAGRA-WV-THUM-LIVE-" + LiveDubPlaying.toUpperCase();
				}
			}

			NetworkLocation = NetworkLocation.replace("rolling_buffer/", "");

			//url = "https://cunolimit.cdnhot.co.il/sdash/LIVE$" + NetworkLocation + "/index.mpd/Manifest?start=LIVE&end=END&device=" + Profile;
			//url = url.Replace("start=LIVE", "start=" + StartTime).Replace("end=END", "end=" + EndTime);

		hotHost = "cunolimit.cdnhot.co.il";

		streamURL = GlobalUtils.NGobjRes.apiGateway + "/sdash/LIVE$" + NetworkLocation + "/index.mpd/Manifest?start=LIVE&end=END&device=" + Profile;
		streamURL = streamURL.replace("start=LIVE", "start=" + StartTime).replace("end=END", "end=" + EndTime);
		var chromeVersion = getChromeVersion();
		var requestid = createNewGuid();

		var headersObj = {
			"x-hot-host": hotHost,
			"client-Token": GlobalUtils.NGobjRes.ClientToken,
			"tokenSession": 123456,
			"x-hot-frontuiversion": GlobalUtils.NGobjRes.WebSiteVersion,
			"x-hot-fwversion": GlobalUtils.AndroidVer,
			"x-hot-browserversion": chromeVersion,
			"x-hot-esn": GlobalUtils.tv_api.GetDeviceID(),
			"x-hot-tokensession": "TBD",
			"x-hot-applicationname": "ANDROID-HOT",
			"x-hot-platform": "NOSTB",
			"x-hot-requestid": requestid,
			"x-hot-drmid": "Widevine",
			"x-hot-context": '{"regionCode": "IL"}'


		};
		$.ajax({
			url: streamURL,
			type: "GET",
			dataType: "json",
			headers: headersObj,
			timeout: GlobalUtils.webServiceTimeOut, // sets timeout to 40 seconds
			success: function (data, textStatus, jqXHR) {
				if (data != null && data.d != null && data.d != "") {
					try {
						var resVal = JSON.parse(data.d);
						if (fCallback != null) { fCallback(resVal); }
					}
					catch (e) {
						if (fCallbackStatic != null) { fCallbackStatic(e); }
					}
				}
				else if (data != null) {
					if (fCallback != null) { fCallback(data); }
				}
			},
			error: function (result) {
				if (result.status == 200) {
					fCallback(result.responseText);
				}
				else {
					if (fCallbackStatic != null) { fCallbackStatic(result); }
				}
			}
		});
	}
	catch (e) {

    }
}
/********************************************************************** nPvr END ******************************************************************/
/********************************************************************** trigger ******************************************************************/
WsVodkaFB_OTT.GetDynamicAds = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "GetDynamicAds", fReturnCallback, false, null);
}
WsVodkaFB_OTT.SetDynamicAds = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "SetDynamicAds", fReturnCallback, false, null);
}
/********************************************************************** trigger ******************************************************************/
/********************************************************************** Preroll ******************************************************************/
WsVodkaFB_OTT.getPreroll = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getPreroll", fReturnCallback, false, null);
}
WsVodkaFB_OTT.endPrerollViewing = function (sendParam, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "endPrerollViewing", fReturnCallback, false, null);
}
/********************************************************************** Preroll ******************************************************************/
/********************************************************************** ScreenSaver ******************************************************************/
WsVodkaFB_OTT.GetScreenSaver = function (fCallback, fCallbackStatic, params, moduleName, fReturnCallback, doRetry) {
	var data = {};
	WsVodkaFB_OTT.get(data, fCallback, fCallbackStatic, "GetScreenSaverWS", fReturnCallback, doRetry);
};
/********************************************************************** ScreenSaver ********/

/************************ getUniqeCommercialChannel ******************************************************************/
WsVodkaFB_OTT.getUniqeCommercialChannel = function (sendParam,fCallback, fCallbackStatic, params, moduleName, fReturnCallback, doRetry) {
	WsVodkaFB_OTT.get(sendParam, fCallback, fCallbackStatic, "getUniqeCommercialChannel", fReturnCallback, doRetry);
};
/***************************** getUniqeCommercialChannel **********************************/

function getChromeVersion() {
	try {
		var a = navigator.userAgent;
		if (a.indexOf("Chrome") === -1) return false;
		var b = "Chrome/", c = a.indexOf(b), d = a.indexOf(".", c);
		return "Chrome/" + parseInt(a.substring(c + b.length, d), 10);
	}
	catch (e) { }

	return 0;
}

function createNewGuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}