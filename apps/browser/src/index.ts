import m from 'mithril';

import './index.scss';

import { Layout } from './view/layout';
import { Home } from './view/home/home';
import { Status } from './view/status/status';
import { CameraView } from './view/camera/camera';
import { session } from './session';
import { tracker } from './tracking/tracker';
import { Debug } from './debug/debug';
import { archiveSessions } from './archive';

// for the console and the browser tools; the Bolts themselves are `Bolts.get(name)`
window.Session = session;
window.Tracker = tracker;
// camera-based helpers for experiments; no behavior reaches these
window.Debug = Debug;

// completed days of session files move from the private store into sessions/*.zip
void archiveSessions();

m.route(document.body, '/', {
  '/': {
    render: function() {
      return m(Layout, m(Home));
    }
  },
  '/status': {
    render: function() {
      return m(Layout, m(Status));
    }
  },
  '/camera': {
    render: function() {
      return m(Layout, m(CameraView));
    }
  },
});
