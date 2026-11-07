sub init()
    m.top.functionName = "taskMain"
end sub

sub taskMain()
    ecp = "http://localhost:8060"
    xfer = CreateObject("roUrlTransfer")
    xfer.SetUrl(ecp + "/query/apps")
    body = xfer.GetToString()
    if body = invalid or body = ""
        m.top.result = "failed"
        return
    end if

    xml = CreateObject("roXMLElement")
    if not xml.Parse(body)
        m.top.result = "failed"
        return
    end if

    target = LCase(m.top.appName)
    appId = ""
    for each app in xml.GetChildElements()
        name = LCase(app.GetText())
        ' Exact name first, otherwise the first channel whose name starts with it (e.g. "Fawesome.tv").
        if name = target
            appId = app.GetAttributes().id
            exit for
        else if appId = "" and Left(name, Len(target)) = target
            appId = app.GetAttributes().id
        end if
    end for
    if appId = ""
        m.top.result = "notInstalled"
        return
    end if

    launchUrl = ecp + "/launch/" + appId
    if m.top.contentId <> ""
        launchUrl = launchUrl + "?contentId=" + xfer.Escape(m.top.contentId)
        if m.top.mediaType <> "" then launchUrl = launchUrl + "&mediaType=" + xfer.Escape(m.top.mediaType)
    end if
    port = CreateObject("roMessagePort")
    post = CreateObject("roUrlTransfer")
    post.SetMessagePort(port)
    post.SetUrl(launchUrl)
    if post.AsyncPostFromString("")
        msg = wait(5000, port)
        if type(msg) = "roUrlEvent"
            code = msg.GetResponseCode()
            if code >= 200 and code < 300
                m.top.result = "ok"
                return
            end if
        end if
    end if
    m.top.result = "failed"
end sub
