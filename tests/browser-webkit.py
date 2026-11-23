#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Optional Linux WebKitGTK smoke test. Run in a graphical session with PyGObject,
GTK 4 and WebKitGTK 6. This exercises DOM-activated controls, not physical touch.
Exit 77 means the optional browser or graphical session is unavailable.
"""
import argparse
import json
import sys
from urllib.parse import urlsplit


def skip(message):
    print(f"SKIP: {message}", file=sys.stderr)
    return 77


CHECK = """
const el = id => document.getElementById(id);
const phase = value => document.body.dataset.phase === value;
async function until(condition, name) {
    for (let attempt = 0; attempt < 180; attempt++) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 70));
    }
    throw Error(name + ' timed out at ' + document.body.dataset.phase + ' ' + el('panel-copy').textContent);
}
await until(() => el('status').textContent === 'Race selection', 'Menu, track modules and WebGL');
const gl = el('world').getContext('webgl');
const gpu = gl.getExtension('WEBGL_debug_renderer_info');
const report = {
    renderer:gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    webAudio:typeof AudioContext, gamepad:typeof navigator.getGamepads, pointer:typeof PointerEvent
};
el('sound').click();
el('controllers').click();
await until(() => el('driver-device').options.length > 0, 'Device picker');
el('driver-device').value = 'touch';
el('driver-device').dispatchEvent(new Event('change'));
el('use-device').click();
if (document.body.dataset.input !== 'touch') throw Error('Touch selection failed');
for (const course of ['ridge','speedway']) {
    el('choose-' + course).click();
    el('start').click();
    await until(() => phase('grid'), 'Grid');
    el('touch-arm').click();
    await until(() => phase('racing'), 'Countdown');
    if (document.body.dataset.course !== course) throw Error('Unexpected course');
    const button = name => document.querySelector('[data-touch="'+name+'"]');
    report.controls = [...document.querySelectorAll('[data-touch]')].map(b => b.dataset.touch);
    if (getComputedStyle(button('throttle')).touchAction !== 'none') throw Error('Unprotected pedal surface');
    button('recover').click();
    await until(() => el('feedback').textContent.includes('Recovered'), 'Recovery');
    button('pause').click();
    await until(() => phase('paused'), 'Pause');
    el('continue').click();
    await until(() => phase('racing'), 'Resume');
    window.dispatchEvent(new Event('pagehide'));
    await until(() => phase('paused'), 'Page interruption');
    el('courses').click();
    await until(() => phase('menu'), 'Course select');
}
if (window.testErrors.length) throw Error(window.testErrors.join('; '));
return JSON.stringify(report);
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url', help='HTTP(S) URL of the assembled game')
    url = parser.parse_args().url
    if urlsplit(url).scheme not in ('http', 'https'):
        parser.error('Supply the HTTP(S) URL of the assembled game.')
    try:
        import gi
        gi.require_version('Gtk', '4.0')
        gi.require_version('Gdk', '4.0')
        gi.require_version('WebKit', '6.0')
        from gi.repository import Gdk, GLib, Gtk, WebKit
    except (ImportError, ValueError) as error:
        return skip(str(error))
    if not Gtk.init_check() or Gdk.Display.get_default() is None:
        return skip('GTK requires an available graphical session')

    loop = GLib.MainLoop()
    window = Gtk.Window()
    window.set_title('Circuit Overdrive compatibility test')
    window.set_default_size(844, 390)
    view = WebKit.WebView()
    window.set_child(view)
    capture_errors = WebKit.UserScript.new(
        """window.testErrors = [];
        window.addEventListener('error', e => window.testErrors.push(e.message), false);
        window.addEventListener('unhandledrejection', e => window.testErrors.push(String(e.reason)));""",
        WebKit.UserContentInjectedFrames.TOP_FRAME, WebKit.UserScriptInjectionTime.START, None, None)
    view.get_user_content_manager().add_script(capture_errors)
    exit_status = 1
    started = False

    def fail(message):
        print(f'FAIL: {message}', file=sys.stderr)
        loop.quit()

    def finished(browser, result, _):
        nonlocal exit_status
        try:
            value = browser.call_async_javascript_function_finish(result)
            report = json.loads(value.to_string())
            if sorted(report['controls']) != sorted(['left','right','brake','throttle','camera','pause','recover']):
                raise ValueError('Touch control set incomplete')
            version = (WebKit.get_major_version(), WebKit.get_minor_version(), WebKit.get_micro_version())
            print(json.dumps({'url':url, 'webkitgtk':'.'.join(map(str, version)), 'courses':['ridge','speedway'],
                              'input':'Desktop DOM action activation', **report}, indent=2))
            exit_status = 0
        except (GLib.Error, ValueError, KeyError) as error:
            fail(error)
        loop.quit()

    def loaded_callback(browser, event):
        nonlocal started
        if event == WebKit.LoadEvent.FINISHED and not started:
            started = True
            browser.call_async_javascript_function(CHECK, -1, None, None, None, None, finished, None)

    view.connect('load-changed', loaded_callback)
    view.connect('web-process-terminated', lambda browser, reason: fail(reason))
    GLib.timeout_add_seconds(60, lambda: fail('WebKit did not finish in 60 seconds'))
    window.present()
    view.load_uri(url)
    loop.run()
    window.destroy()
    return exit_status


if __name__ == '__main__':
    sys.exit(main())
