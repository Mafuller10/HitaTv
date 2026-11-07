sub init()
    m.stack = m.top.findNode("stack")
    m.loading = m.top.findNode("loading")
    m.loadingLabel = m.top.findNode("loadingLabel")
    m.views = []

    m.catalog = CreateObject("roSGNode", "CatalogTask")
    m.catalog.observeField("status", "onCatalogStatus")
    m.catalog.control = "RUN"
end sub

sub onCatalogStatus()
    st = m.catalog.status
    if st = "ready"
        m.loading.visible = false
        home = CreateObject("roSGNode", "HomeView")
        home.catalogTask = m.catalog
        home.observeField("itemSelected", "onItemSelected")
        home.observeField("navAction", "onNavAction")
        pushView(home)
        home.view = "home"
    else if st = "error"
        m.loadingLabel.text = m.catalog.statusMessage
    end if
end sub

' ---------------------------------------------------------------- view stack

sub pushView(v as object)
    if m.views.Count() > 0 then m.views.Peek().visible = false
    m.stack.appendChild(v)
    m.views.Push(v)
    v.setFocus(true)
end sub

sub popView()
    if m.views.Count() <= 1 then return
    v = m.views.Pop()
    m.stack.removeChild(v)
    top = m.views.Peek()
    top.visible = true
    top.setFocus(true)
    if top.hasField("refresh") then top.refresh = true
end sub

' ---------------------------------------------------------------- events from views

sub onItemSelected(evt as object)
    item = evt.getData()
    if item = invalid then return
    d = CreateObject("roSGNode", "DetailsView")
    d.catalogTask = m.catalog
    d.observeField("action", "onDetailsAction")
    d.observeField("itemSelected", "onItemSelected")
    pushView(d)
    d.content = item
end sub

sub onNavAction(evt as object)
    if evt.getData() = "search"
        sv = CreateObject("roSGNode", "SearchView")
        sv.catalogTask = m.catalog
        sv.observeField("itemSelected", "onItemSelected")
        pushView(sv)
    end if
end sub

sub onDetailsAction(evt as object)
    a = evt.getData()
    if a = invalid then return
    if a.type = "play"
        p = CreateObject("roSGNode", "PlayerView")
        p.observeField("closed", "onPlayerClosed")
        pushView(p)
        p.startAt = a.startAt
        p.content = a.item
    else if a.type = "launch"
        launchExternal(a.item)
    else if a.type = "weblink"
        showWebLink(a.item, "")
    end if
end sub

sub onPlayerClosed()
    popView()
end sub

' ---------------------------------------------------------------- partner channels

sub launchExternal(item as object)
    m.pendingLaunch = item
    t = CreateObject("roSGNode", "LaunchTask")
    t.appName = item.extApp
    t.contentId = item.extContentId
    t.mediaType = item.extMediaType
    t.observeField("result", "onLaunchResult")
    t.control = "RUN"
    m.launchTask = t
end sub

sub onLaunchResult()
    r = m.launchTask.result
    item = m.pendingLaunch
    if r = "ok" then return
    if r = "notInstalled"
        showWebLink(item, item.extApp + " isn't installed on this Roku. Add the free " + item.extApp + " channel from the Roku Channel Store, or watch on the web:")
    else
        showWebLink(item, "Couldn't open " + item.extApp + " automatically. Open the " + item.extApp + " channel from your Roku home screen, or watch on the web:")
    end if
end sub

sub showWebLink(item as object, intro as string)
    if intro = "" then intro = "Watch “" + item.title + "” on the web:"
    dlg = CreateObject("roSGNode", "StandardMessageDialog")
    dlg.title = item.title
    dlg.message = [intro, item.extWebUrl, "Tip: to let HitaTV open " + item.extApp + " directly, go to Settings > System > Advanced system settings > Control by mobile apps and allow network access."]
    dlg.buttons = ["OK"]
    dlg.observeField("buttonSelected", "closeDialog")
    dlg.observeField("wasClosed", "closeDialog")
    m.top.dialog = dlg
end sub

sub closeDialog()
    if m.top.dialog <> invalid then m.top.dialog.close = true
end sub

' ---------------------------------------------------------------- keys

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "back"
        if m.views.Count() > 1
            top = m.views.Peek()
            ' The player saves progress itself before closing.
            if top.subtype() = "PlayerView"
                top.close = true
            else
                popView()
            end if
            return true
        end if
    end if
    return false
end function
