import m from 'mithril';

import './index.scss';

import { Layout } from './view/layout';
import { Home } from './view/home/home';
import { Status } from './view/status/status';
import { CameraView } from './view/camera/camera';
import { BrainView, brainView } from './brain-view/view';
import { session } from './session';
import { tracker } from './tracking/tracker';
import { Debug } from './debug/debug';
import { archiveSessions } from './archive';
import { fatal } from './fatal';
import './reload';

// any error ends the session, see fatal.ts
window.addEventListener('error', (e) => fatal(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => fatal(e.reason));

// for the console and the browser tools; the Bolts themselves are `Bolts.get(name)`
window.Session = session;
window.Tracker = tracker;
// camera-based helpers for experiments; no behavior reaches these
window.Debug = Debug;
// the brain tab's scene, light and resting network
window.BrainView = brainView;

// completed days of session files move from the private store into apps/browser/sessions/*.zip
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
  '/brain': {
    render: function() {
      return m(Layout, m(BrainView));
    }
  },
});
