import { css } from '@emotion/css';
import React, { useMemo, useState } from 'react';

import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { selectors as e2eSelectors } from '@grafana/e2e-selectors';
import { SceneComponentProps, SceneObjectBase } from '@grafana/scenes';
import { Button, ClipboardButton, Divider, Spinner, Stack, useStyles2 } from '@grafana/ui';
import { contextSrv } from 'app/core/core';
import { t, Trans } from 'app/core/internationalization';
import {
  useDeletePublicDashboardMutation,
  useGetPublicDashboardQuery,
  usePauseOrResumePublicDashboardMutation,
} from 'app/features/dashboard/api/publicDashboardApi';
import { NoUpsertPermissionsAlert } from 'app/features/dashboard/components/ShareModal/SharePublicDashboard/ModalAlerts/NoUpsertPermissionsAlert';
import { Loader } from 'app/features/dashboard/components/ShareModal/SharePublicDashboard/SharePublicDashboard';
import {
  generatePublicDashboardUrl,
  PublicDashboard,
} from 'app/features/dashboard/components/ShareModal/SharePublicDashboard/SharePublicDashboardUtils';
import { DashboardInteractions } from 'app/features/dashboard-scene/utils/interactions';
import { AccessControlAction } from 'app/types';

import { getDashboardSceneFor } from '../../../utils/utils';
import { useShareDrawerContext } from '../../ShareDrawer/ShareDrawerContext';

import { EmailSharing } from './EmailShare/EmailSharing';
import { PublicSharing } from './PublicShare/PublicSharing';
import ShareAlerts from './ShareAlerts';
import ShareTypeSelect from './ShareTypeSelect';
import { isEmailSharingEnabled, PublicDashboardShareType } from './utils';

const selectors = e2eSelectors.pages.ShareDashboardDrawer.ShareExternally;

export const getAnyOneWithTheLinkShareOption = () => {
  return {
    label: t('public-dashboard.share-externally.public-share-type-option-label', 'Anyone with the link'),
    description: t(
      'public-dashboard.share-externally.public-share-type-option-description',
      'Anyone with the link can access'
    ),
    value: PublicDashboardShareType.PUBLIC,
    icon: 'globe',
  };
};

const getOnlySpecificPeopleShareOption = () => ({
  label: t('public-dashboard.share-externally.email-share-type-option-label', 'Only specific people'),
  description: t(
    'public-dashboard.share-externally.email-share-type-option-description',
    'Only people with access can open with the link'
  ),
  value: PublicDashboardShareType.EMAIL,
  icon: 'users-alt',
});

const getShareExternallyOptions = () => {
  return isEmailSharingEnabled()
    ? [getOnlySpecificPeopleShareOption(), getAnyOneWithTheLinkShareOption()]
    : [getAnyOneWithTheLinkShareOption()];
};

export class ShareExternally extends SceneObjectBase {
  static Component = ShareExternallyRenderer;
}

function ShareExternallyRenderer({ model }: SceneComponentProps<ShareExternally>) {
  const dashboard = getDashboardSceneFor(model);
  const { data: publicDashboard, isLoading } = useGetPublicDashboardQuery(dashboard.state.uid!);
  const styles = useStyles2(getStyles);

  if (isLoading) {
    return <Loader />;
  }

  return (
    <div className={styles.container}>
      <ShareExternallyBase publicDashboard={publicDashboard} />
    </div>
  );
}

function ShareExternallyBase({ publicDashboard }: { publicDashboard?: PublicDashboard }) {
  const options = getShareExternallyOptions();
  const getShareType = useMemo(() => {
    if (publicDashboard && isEmailSharingEnabled()) {
      const opt = options.find((opt) => opt.value === publicDashboard?.share)!;
      return opt ?? options[0];
    }

    return options[0];
  }, [publicDashboard, options]);

  const [shareType, setShareType] = useState<SelectableValue<PublicDashboardShareType>>(getShareType);
  const hasWritePermissions = contextSrv.hasPermission(AccessControlAction.DashboardsPublicWrite);

  const Config = useMemo(() => {
    if (shareType.value === PublicDashboardShareType.EMAIL && isEmailSharingEnabled()) {
      return <EmailSharing />;
    }

    return <PublicSharing />;
  }, [shareType]);

  return (
    <Stack direction="column" gap={2} data-testid={selectors.container}>
      <ShareAlerts publicDashboard={publicDashboard} />
      <ShareTypeSelect setShareType={setShareType} value={shareType} options={options} />
      {!hasWritePermissions && <NoUpsertPermissionsAlert mode={publicDashboard ? 'edit' : 'create'} />}
      {Config}
      {publicDashboard && (
        <>
          <Divider spacing={0} />
          <Actions publicDashboard={publicDashboard} />
        </>
      )}
    </Stack>
  );
}
function Actions({ publicDashboard }: { publicDashboard: PublicDashboard }) {
  const { dashboard } = useShareDrawerContext();
  const [update, { isLoading: isUpdateLoading }] = usePauseOrResumePublicDashboardMutation();
  const [deletePublicDashboard, { isLoading: isDeleteLoading }] = useDeletePublicDashboardMutation();
  const styles = useStyles2(getStyles);

  const isLoading = isUpdateLoading || isDeleteLoading;
  const hasWritePermissions = contextSrv.hasPermission(AccessControlAction.DashboardsPublicWrite);

  function onCopyURL() {
    DashboardInteractions.publicDashboardUrlCopied();
  }

  const onPauseOrResumeClick = async () => {
    DashboardInteractions.publicDashboardPauseSharingClicked({
      paused: !publicDashboard.isEnabled,
    });
    update({
      dashboard: dashboard,
      payload: {
        ...publicDashboard!,
        isEnabled: !publicDashboard.isEnabled,
      },
    });
  };

  const onDeleteClick = () => {
    DashboardInteractions.revokePublicDashboardClicked();
    deletePublicDashboard({
      dashboard,
      uid: publicDashboard!.uid,
      dashboardUid: dashboard.state.uid!,
    });
  };

  return (
    <Stack alignItems="center" direction={{ xs: 'column', sm: 'row' }}>
      <div className={styles.actionsContainer}>
        <Stack gap={1} flex={1} direction={{ xs: 'column', sm: 'row' }}>
          <ClipboardButton
            data-testid={selectors.copyUrlButton}
            variant="primary"
            fill="outline"
            icon="link"
            disabled={!publicDashboard.isEnabled}
            getText={() => generatePublicDashboardUrl(publicDashboard!.accessToken!)}
            onClipboardCopy={onCopyURL}
          >
            <Trans i18nKey="public-dashboard.share-externally.copy-link-button">Copy external link</Trans>
          </ClipboardButton>
          <Button
            icon="trash-alt"
            variant="destructive"
            fill="outline"
            disabled={isLoading || !hasWritePermissions}
            onClick={onDeleteClick}
          >
            <Trans i18nKey="public-dashboard.share-externally.revoke-access-button">Revoke access</Trans>
          </Button>
          <Button
            icon={publicDashboard.isEnabled ? 'pause' : 'play'}
            variant="secondary"
            fill="outline"
            tooltip={
              publicDashboard.isEnabled
                ? t(
                    'public-dashboard.share-externally.pause-access-tooltip',
                    'Pausing will temporarily disable access to this dashboard for all users'
                  )
                : ''
            }
            onClick={onPauseOrResumeClick}
            disabled={isLoading || !hasWritePermissions}
          >
            {publicDashboard.isEnabled ? (
              <Trans i18nKey="public-dashboard.share-externally.pause-access-button">Pause access</Trans>
            ) : (
              <Trans i18nKey="public-dashboard.share-externally.resume-access-button">Resume access</Trans>
            )}
          </Button>
        </Stack>
      </div>
      {isLoading && <Spinner />}
    </Stack>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    paddingBottom: theme.spacing(2),
  }),
  actionsContainer: css({
    width: '100%',
  }),
});
