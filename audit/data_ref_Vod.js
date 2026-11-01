var WsVodkaFB = {};

WsVodkaFB.get = function (sendParam, fCallback, fCallbackStatic, methodName, fReturnCallback, doRetry, errorCodes) {
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

    var timeOutServerCall = GlobalUtils.webServiceTimeOut;

    if (methodName == "InternetCheck") {
        timeOutServerCall = 3000;
    }

    $.ajax({
        url: url,
        type: "POST",
        data: JSON.stringify(sendParam),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        timeout: timeOutServerCall, // sets timeout to 40 seconds
        async: true,
        cache: true,

        success: function (data, textStatus, jqXHR) {
            //console.error(methodName + " success");
            //GlobalUtils.showLoadingLogo(false, { "LoaderId": "dvLoader", "LoaderFrom": " WsVodkaFB_Vod error " + url });
            if (data != null && data.d != null && data.d != "") { //check type of d == string ????
                try {

                    if (methodName == "GetMetaDataForNode" || methodName == "GetMetaDataForEditorials" || methodName == "getMetaDataByIds" || methodName == "GetSvodsByAccountUid" || methodName == "GetServerTime" || methodName == "InternetCheck") {
                        if (fCallback != null) {
                            fCallback(data.d, fReturnCallback);
                            return;
                        }
                    }

                    var jsonError = JSON.parse(data.d);
                    var popupError = null;

                    // Nagra Error
                    if (jsonError != null && jsonError.resultCode != null && jsonError.resultCode != 0) {
                        //console.error(methodName + " on success send Nagra error");
                        if (errorCodes != null && errorCodes.MethodID != null) {
                            GlobalUtils.handleNagraErrors(errorCodes, function (nagraPopupError) {
                                if (fCallbackStatic != null) {
                                    fCallbackStatic(data, nagraPopupError);
                                }
                            });
                        }
                        else if (fCallbackStatic != null) {
                            fCallbackStatic(data, popupError);
                        }

                        // Send Log
                        GlobalUtils.Loger("555", jqXHR.status, jqXHR.status, jqXHR.statusText, function () { console.error("Send Error Log - Success"); }, function () { console.error("Send Error Log - Error"); });
                    }
                    // Hot WS Error
                    else if (jsonError != null && jsonError.err != null && jsonError.err.id != null && jsonError.err.reason != null && jsonError.err.content != null) { // if 204 ???
                        if (errorCodes != null && errorCodes.MethodID != null) {
                            console.error(methodName + " on success show HOT error popup");
                            var reason = jsonError.err.reason ? "-" + jsonError.err.reason : "";
                            title = "";
                            body = jsonError.err.content + "<br><br><div style='font-size:32px;'>" + "מספר שגיאה <span style='font-size:24px;'>" + errorCodes.MethodID + "-" + jsonError.err.id + reason + "</span></div>";
                            popupError = function () { GlobalUtils.ShowPopupMessage(title, body, false, null, null, 0, null, null, null, null, null, null, null, true); };
                        }

                        if (fCallbackStatic != null) {
                            var res = (data.d != null) ? data.d : data;
                            fCallbackStatic(res, popupError);
                        }
                    }
                    // Success
                    else {
                        // console.error("no error - do success callback");
                        if (fCallback != null) {
                            fCallback(data.d, fReturnCallback);
                        }
                    }

                }
                catch (e) {
                    // Success
                    if (fCallback != null) {
                        fCallback(data.d, fReturnCallback);
                    }
                }
            }
            else {
                // Success
                if (fCallback != null) {
                    fCallback();
                }
            }
        },
        error: function (result, _textStatus) {
            //console.error("methodName", result.statusText);

            switch (result.status) {
                case 503:
                    GlobalUtils.SystemErrorExit(503);
                    break;
                case 404:
                    console.error("result.status", result.status);
                    break;
                case 0:
                    console.error("result.status", result.status);
                    break;
            }

            GlobalUtils.showLoadingLogo(false, { "LoaderId": "dvLoader", "LoaderFrom": " WsVodkaFB error " + url });

            if (fCallbackStatic != null) {
                fCallbackStatic(result);
            }
        }
    });
};

WsVodkaFB.GetMetadataByParentHierarchyId = function (pHuid, hasChild, offset, limit, NodeLayoutInfo, isTitleSort, isDesc, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    if (offset == null) { offset = 0; }
    if (limit == null) { limit = 5000; }
    if (NodeLayoutInfo == null) { NodeLayoutInfo = ""; }

    if (isTitleSort == null) { isTitleSort = ""; }
    if (isDesc == null) { isDesc = ""; }

    var errorCodes = hasChild ? GlobalUtils.getErrorCodes("editorials") : GlobalUtils.getErrorCodes("nodes");

    var areaVod = "";
    if (mainApp.CurrentApplication) {
        areaVod = GlobalUtils.GetAreaFromItemType() ? GlobalUtils.GetAreaFromItemType() : "";
    }

    var locale = GlobalUtils.portalLangLocale;
    if (GlobalUtils.portalLangLocale == "ru_RU") {
        locale = "en_GB";
    }
    if (NodeLayoutInfo == "Y" || areaVod == "22") {
        locale = "he_IL";
    }


    var data = {
        'pHuid': pHuid, 'hasChild': hasChild, 'offset': offset, 'limit': limit, 'NodeLayoutInfo': NodeLayoutInfo, 'encryptedData': GlobalUtils.NGobjRes.encryptedData, 'deviceId': GlobalUtils.tv_api.GetDeviceID(), 'isTitleSort': isTitleSort, 'isDesc': isDesc, 'locale': locale};

    WsVodkaFB.get(data, fCallback, fCallbackStatic, "getMDByPHUID_MEDIA_LIVE", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.MediaLiveSearch = function (SearchTitle, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("mediaLiveSearch");
    var data = { 'SearchTitle': SearchTitle, 'PageIndex': 1, 'PageSize': 100, 'ClientID': GlobalUtils.ClientID, 'encryptedData': GlobalUtils.NGobjRes.encryptedData };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "mediaLiveSearch", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.setTvodPurchase = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "setTvodPurchase", fReturnCallback);
}

WsVodkaFB.ReserveEx = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "JSonReserveExWMaster", fReturnCallback);
}
WsVodkaFB.ReportOTTDiagnosticData = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "ReportOTTDiagnosticData", fReturnCallback);
}
WsVodkaFB.SvodRegisterEx = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "SvodRegisterEx", fReturnCallback);
}
WsVodkaFB.GetSvodDetails = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetSvodDetails", fReturnCallback);
}
WsVodkaFB.OttAddAssetEntitlement = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "OttAddAssetEntitlement", fReturnCallback);
}
WsVodkaFB.UpdateBucketLimit = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "UpdateBucketLimit", fReturnCallback);
}
WsVodkaFB.GetBucketLimit = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetBucketLimit", fReturnCallback);
}
WsVodkaFB.LogHD = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback) {
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "LogHD", fReturnCallback);
}
WsVodkaFB.DisconnectUser = function (fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("disconnectUser");

    var data = { 'encryptedData': GlobalUtils.NGobjRes.encryptedData, 'deviceId': GlobalUtils.tv_api.GetDeviceID() };

    WsVodkaFB.get(data, fCallback, fCallbackStatic, "disconnectUser", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.disconnectUserByCa_Sn = function (ca_sn, udid, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("disconnectUserByCa_Sn");

    var data = { 'AccountNumber': GlobalUtils.NGobjRes.ACN, 'deviceId': udid, 'Ca_Sn': ca_sn };

    WsVodkaFB.get(data, fCallback, fCallbackStatic, "disconnectUserByCa_Sn", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.GetErrorText = function (errorCode, errorReason, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("getErrorText");

    var data = {
        'errorCode': errorCode, 'errorReason': errorReason, 'encryptedData': GlobalUtils.NGobjRes.encryptedData, 'deviceId': GlobalUtils.tv_api.GetDeviceID()
    };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "getErrorText", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetMetaDataByIdsForSearch = function (idsAssets, idsNodes, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetMetaDataByIdsForSearch");
    var data = { 'idsAssets': idsAssets, 'idsNodes': idsNodes, 'encryptedData': GlobalUtils.NGobjRes.encryptedData };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetMetaDataByIdsForSearch", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetMetaDataByIds = function (idsAssets, idsNodes, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("getMetaDataByIds");
    var data = { 'idsAssets': idsAssets, 'idsNodes': idsNodes, 'encryptedData': GlobalUtils.NGobjRes.encryptedData };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "getMetaDataByIds", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetMetaDataByIdsGetItemSEYoung = function (idsAssets, idsNodes, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("getMetaDataByIds");
    var data = { 'idsAssets': idsAssets, 'idsNodes': idsNodes, 'encryptedData': GlobalUtils.NGobjRes.encryptedData };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetMetaDataByIdsGetItemSEYoung", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetSvodsByAccountUid = function (fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetSvodsByAccountUid");
    var data = { 'accountUid': GlobalUtils.NGobjRes.AccountUid, 'encryptedData': GlobalUtils.NGobjRes.encryptedData };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetSvodsByAccountUid", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetRates = function (fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetRates");
    var data = { 'encryptedData': GlobalUtils.NGobjRes.encryptedData };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetRates", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetProductDetails = function (productCode, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetProductDetails");
    var data = { 'encryptedData': GlobalUtils.NGobjRes.encryptedData, 'productCode': productCode };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetProductDetails", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.GetProductdata = function (channel_id, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetProductdata");
    var data = { 'encryptedData': GlobalUtils.NGobjRes.encryptedData, 'channel_id': channel_id };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetProductdata", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.PurchaseProducts = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("PurchaseProducts");
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "PurchaseProducts", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.DoClearence = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("DoClearence");
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "DoClearence", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetAccountStatus = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetAccountStatus");
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetAccountStatus", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetInvoiceFull = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetInvoiceFull");
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetInvoiceFull", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.SendCustomerInvoicesToMail = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("SendCustomerInvoicesToMail");
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "SendCustomerInvoicesToMail", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.GetServerTime = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("SendCustomerInvoicesToMail");
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetServerTime", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.InternetCheck = function (data, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("SendCustomerInvoicesToMail");
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "InternetCheck", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.GetMetaDataForNode = function (idsAssets, locale, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetMetaDataForNode");
    var data = { 'idsAssets': idsAssets, 'locale': locale, 'encryptedData': GlobalUtils.NGobjRes.encryptedData };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetMetaDataForNode", fReturnCallback, doRetry, errorCodes);
};
WsVodkaFB.GetMetaDataForEditorials = function (idsAssets, locale, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var errorCodes = GlobalUtils.getErrorCodes("GetMetaDataForEditorials");
    var data = { 'idsAssets': idsAssets, 'locale': locale, 'encryptedData': GlobalUtils.NGobjRes.encryptedData };
    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetMetaDataForEditorials", fReturnCallback, doRetry, errorCodes);
};

WsVodkaFB.getVodHomePage = function (vodArea, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {


    //var errorCodes = hasChild ? GlobalUtils.getErrorCodes("editorials") : GlobalUtils.getErrorCodes("nodes");

    var areaVod = vodArea ? vodArea : "";

    //if (mainApp.CurrentApplication) {
    //    areaVod = GlobalUtils.GetAreaFromItemType() ? GlobalUtils.GetAreaFromItemType() : "";
    //}

    var lang = GlobalUtils.portalLangID;
    if (GlobalUtils.portalLangLocale == "ru_RU") {
        lang = 3;
    }
    if (areaVod == "22") {
        lang = 1;
    }

    var clientTypeForAtmos = GlobalUtils.getClientTypeAtmos();

    var data = {

        "homeID": GlobalUtils.NGobjRes.ACN,
        "sc": GlobalUtils.NGobjRes.CA_SN,
        "area": areaVod,
        "enable_recommendation": true,
        "talaCallback": "",
        "lang": lang,
        "offset": 0,
        "size": 50,
        'ClientToken': GlobalUtils.NGobjRes.ClientToken,
        'clientTypeForAtmos': clientTypeForAtmos

    };

    WsVodkaFB.get(data, fCallback, fCallbackStatic, "getVodHomePageWS", fReturnCallback, doRetry);
};
WsVodkaFB.GetPersonalHomePage = function (fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {


    //var errorCodes = hasChild ? GlobalUtils.getErrorCodes("editorials") : GlobalUtils.getErrorCodes("nodes");

    var areaVod = "2";

    if (mainApp.CurrentApplication) {
        areaVod = GlobalUtils.GetAreaFromItemType() ? GlobalUtils.GetAreaFromItemType() : "";
    }

    var lang = GlobalUtils.portalLangID;
    if (GlobalUtils.portalLangLocale == "ru_RU") {
        lang = 3;
    }
    if (areaVod == "22") {
        lang = 1;
    }
    var talaCallbackParse = JSON.parse(GlobalUtils.talaCallback);
    var varArr = JSON.stringify(talaCallbackParse.mappedFilterIDs)
    var talaSt = "{mappedFilterIDs:" + varArr + "}"

    var data = {
        "homeID": GlobalUtils.NGobjRes.ACN,
        "sc": GlobalUtils.NGobjRes.CA_SN,
        "area": areaVod,
        "enable_recommendation": true,
        "talaCallback": talaSt,
        "lang": lang,
        "offset": 0,
        "size": 50,
        'ClientToken': GlobalUtils.NGobjRes.ClientToken

    }

    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetPersonalHomePageWS", fReturnCallback, doRetry);
};
WsVodkaFB.MoreSVOD = function (EditorialID, objsvodId, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {


    //var errorCodes = hasChild ? GlobalUtils.getErrorCodes("editorials") : GlobalUtils.getErrorCodes("nodes");

    var areaVod = "2";

    if (mainApp.CurrentApplication) {
        areaVod = GlobalUtils.GetAreaFromItemType() ? GlobalUtils.GetAreaFromItemType() : "";
    }

    var lang = GlobalUtils.portalLangID;
    if (GlobalUtils.portalLangLocale == "ru_RU") {
        lang = 3;
    }
    if (areaVod == "22") {
        lang = 1;
    }

    var data = {

        "HomeID": GlobalUtils.NGobjRes.ACN,
        "SC": GlobalUtils.NGobjRes.CA_SN,
        "Area": areaVod,
        "lang": lang,
        "EditorialID": EditorialID,
        "Svod": objsvodId
    };

    WsVodkaFB.get(data, fCallback, fCallbackStatic, "MoreSVODWS", fReturnCallback, doRetry);
};


WsVodkaFB.GetEroticHomePage = function (eroticId, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {


    //var errorCodes = hasChild ? GlobalUtils.getErrorCodes("editorials") : GlobalUtils.getErrorCodes("nodes");
    var clientTypeForAtmos = GlobalUtils.getClientTypeAtmos();

    var nodeId = eroticId;
    var areaVod;

    if (mainApp.CurrentApplication) {
        areaVod = GlobalUtils.GetAreaFromItemType() ? GlobalUtils.GetAreaFromItemType() : "";
    }

    var lang = GlobalUtils.portalLangID;
    if (GlobalUtils.portalLangLocale == "ru_RU") {
        lang = 3;
    }
    if (areaVod == "22") {
        lang = 1;
    }



    var data = {

        "nodeId": nodeId,
        "lang": lang,
        "offset": 0,
        "size": 50,
        'clientTypeForAtmos': clientTypeForAtmos

    };

    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetEroticHomePageWs", fReturnCallback, doRetry);
};

WsVodkaFB.GetPromoNodesByParentID = function (promotionParentId, vodArea, enable_recommendation, offset, size, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {

    var lang = GlobalUtils.portalLangID;
    if (GlobalUtils.portalLangLocale == "ru_RU") {
        lang = 3;
    }
    if (vodArea == "22") {
        lang = 1;
    }

    var data = {
        "homeID": GlobalUtils.NGobjRes.ACN,
        "sc": GlobalUtils.NGobjRes.CA_SN,
        "enable_recommendation": enable_recommendation,
        "offset": offset,
        "size": size,
        "area": vodArea,
        "node_id": promotionParentId,
        "lang": lang,
        'encryptedData': GlobalUtils.NGobjRes.encryptedData
    }


    //var errorCodes = hasChild ? GlobalUtils.getErrorCodes("editorials") : GlobalUtils.getErrorCodes("nodes");


    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetPromoNodesByParentIDWS", fReturnCallback, doRetry);
}

WsVodkaFB.GetMoreRecommendationsbyNodeId = function (parentId, offset, size, RailModelName, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {
    var vodArea;
    switch (GlobalUtils.ItemType) {
        case GlobalUtils.Config.Types.Series:
            vodArea = GlobalUtils.Config.VodArea.Series;
            break;
        case GlobalUtils.Config.Types.Movies:
            vodArea = GlobalUtils.Config.VodArea.Movies;
            break;
        case GlobalUtils.Config.Types.Kids:
            vodArea = GlobalUtils.Config.VodArea.Kids;
            break;
        default:
            promotionParentId = "";
            break
    }
    var lang = GlobalUtils.portalLangID;
    if (GlobalUtils.portalLangLocale == "ru_RU") {
        lang = 3;
    }
    if (vodArea == "22") {
        lang = 1;
    }

    var data = {
        "homeID": GlobalUtils.NGobjRes.ACN,
        "sc": GlobalUtils.NGobjRes.CA_SN,
        "offset": offset,
        "size": size,
        "area": vodArea,
        "node_id": parentId,
        "lang": lang,
        "RailModelName": RailModelName
    }

    //  "stb_id": Utils.GetStbTypeId() ??



    //var errorCodes = hasChild ? GlobalUtils.getErrorCodes("editorials") : GlobalUtils.getErrorCodes("nodes");


    WsVodkaFB.get(data, fCallback, fCallbackStatic, "GetMoreRecommendationsbyNodeIdWS", fReturnCallback, doRetry);
}


WsVodkaFB.EndViewing = function (assetId, fCallback, fCallbackStatic, moduleName, fReturnCallback, doRetry) {


    var vodArea = "2";

    if (mainApp.CurrentApplication) {
        vodArea = GlobalUtils.GetAreaFromItemType() ? GlobalUtils.GetAreaFromItemType() : "";
    }

    var data = {
        "homeID": GlobalUtils.NGobjRes.ACN,
        "sc": GlobalUtils.NGobjRes.CA_SN,
        "itemID": assetId,
        "area": vodArea
    }


    //var errorCodes = hasChild ? GlobalUtils.getErrorCodes("editorials") : GlobalUtils.getErrorCodes("nodes");


    WsVodkaFB.get(data, fCallback, fCallbackStatic, "EndViewingWS", fReturnCallback, doRetry);
};