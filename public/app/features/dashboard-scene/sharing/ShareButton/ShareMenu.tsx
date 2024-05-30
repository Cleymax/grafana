import React from 'react';
import { useAsyncFn } from 'react-use';

import { selectors as e2eSelectors } from '@grafana/e2e-selectors';
import { VizPanel } from '@grafana/scenes';
import { Menu } from '@grafana/ui';

import { DashboardScene } from '../../scene/DashboardScene';
import { ShareDrawer } from '../ShareDrawer';

import { ShareExternally } from './share-externally/ShareExternally';
import { ShareSnapshot } from './share-snapshot/ShareSnapshot';
import { buildShareUrl } from './utils';

const newShareButtonSelector = e2eSelectors.pages.Dashboard.DashNav.newShareButton.menu;

export default function ShareMenu({ dashboard, panel }: { dashboard: DashboardScene; panel?: VizPanel }) {
  const [_, buildUrl] = useAsyncFn(async () => {
    return await buildShareUrl(dashboard, panel);
  }, [dashboard]);

  const onShareExternallyClick = () => {
    const drawer = new ShareDrawer({
      title: 'Share externally',
      body: new ShareExternally({ dashboardRef: dashboard.getRef() }),
    });

    dashboard.showModal(drawer);
  };

  const onShareSnapshotClick = () => {
    const drawer = new ShareDrawer({
      title: 'Share snapshot',
      body: new ShareSnapshot({ dashboardRef: dashboard.getRef() }),
    });

    dashboard.showModal(drawer);
  };

  return (
    <Menu data-testid={newShareButtonSelector.container}>
      <Menu.Item
        testId={newShareButtonSelector.shareInternally}
        label="Share internally"
        description="Copy link"
        icon="building"
        onClick={buildUrl}
      />
      <Menu.Item
        testId={newShareButtonSelector.shareExternally}
        label="Share externally"
        icon="share-alt"
        onClick={onShareExternallyClick}
      />
      <Menu.Item
        testId={newShareButtonSelector.shareSnapshot}
        label="Share snapshot"
        icon="camera"
        onClick={onShareSnapshotClick}
      />
    </Menu>
  );
}
