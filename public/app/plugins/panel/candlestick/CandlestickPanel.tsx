// this file is pretty much a copy-paste of TimeSeriesPanel.tsx :(
// with some extra renderers passed to the <TimeSeries> component

import React, { useMemo, useState } from 'react';
import uPlot from 'uplot';

import { DashboardCursorSync, Field, getDisplayProcessor, getLinksSupplier, PanelProps } from '@grafana/data';
import { PanelDataErrorView } from '@grafana/runtime';
import { TooltipDisplayMode } from '@grafana/schema';
import { TooltipPlugin, TooltipPlugin2, UPlotConfigBuilder, usePanelContext, useTheme2, ZoomPlugin } from '@grafana/ui';
import { AxisProps } from '@grafana/ui/src/components/uPlot/config/UPlotAxisBuilder';
import { ScaleProps } from '@grafana/ui/src/components/uPlot/config/UPlotScaleBuilder';
import { TimeRange2, TooltipHoverMode } from '@grafana/ui/src/components/uPlot/plugins/TooltipPlugin2';
import { TimeSeries } from 'app/core/components/TimeSeries/TimeSeries';
import { config } from 'app/core/config';

import { TimeSeriesTooltip } from '../timeseries/TimeSeriesTooltip';
import { AnnotationEditorPlugin } from '../timeseries/plugins/AnnotationEditorPlugin';
import { AnnotationsPlugin } from '../timeseries/plugins/AnnotationsPlugin';
import { AnnotationsPlugin2 } from '../timeseries/plugins/AnnotationsPlugin2';
import { ContextMenuPlugin } from '../timeseries/plugins/ContextMenuPlugin';
import { ExemplarsPlugin } from '../timeseries/plugins/ExemplarsPlugin';
import { OutsideRangePlugin } from '../timeseries/plugins/OutsideRangePlugin';
import { ThresholdControlsPlugin } from '../timeseries/plugins/ThresholdControlsPlugin';

import { prepareCandlestickFields } from './fields';
import { Options, defaultCandlestickColors, VizDisplayMode } from './types';
import { drawMarkers, FieldIndices } from './utils';

interface CandlestickPanelProps extends PanelProps<Options> {}

export const CandlestickPanel = ({
  data,
  id,
  timeRange,
  timeZone,
  width,
  height,
  options,
  fieldConfig,
  onChangeTimeRange,
  replaceVariables,
}: CandlestickPanelProps) => {
  const { sync, canAddAnnotations, onThresholdsChange, canEditThresholds, showThresholds } = usePanelContext();

  const theme = useTheme2();

  const info = useMemo(() => {
    return prepareCandlestickFields(data.series, options, theme, timeRange);
  }, [data.series, options, theme, timeRange]);

  // temp range set for adding new annotation set by TooltipPlugin2, consumed by AnnotationPlugin2
  const [newAnnotationRange, setNewAnnotationRange] = useState<TimeRange2 | null>(null);

  const { renderers, tweakScale, tweakAxis, shouldRenderPrice } = useMemo(() => {
    let tweakScale = (opts: ScaleProps, forField: Field) => opts;
    let tweakAxis = (opts: AxisProps, forField: Field) => opts;

    let doNothing = {
      renderers: [],
      tweakScale,
      tweakAxis,
      shouldRenderPrice: false,
    };

    if (!info) {
      return doNothing;
    }

    // Un-encoding the already parsed special fields
    // This takes currently matched fields and saves the name so they can be looked up by name later
    // ¯\_(ツ)_/¯  someday this can make more sense!
    const fieldMap = info.names;

    if (!Object.keys(fieldMap).length) {
      return doNothing;
    }

    const { mode, candleStyle, colorStrategy } = options;
    const colors = { ...defaultCandlestickColors, ...options.colors };
    let { open, high, low, close, volume } = fieldMap; // names from matched fields

    if (open == null || close == null) {
      return doNothing;
    }

    let volumeAlpha = 0.5;

    let volumeIdx = -1;

    let shouldRenderVolume = false;

    // find volume field and set overrides
    if (volume != null && mode !== VizDisplayMode.Candles) {
      let volumeField = info.volume!;

      if (volumeField != null) {
        shouldRenderVolume = true;

        let { fillOpacity } = volumeField.config.custom;

        if (fillOpacity) {
          volumeAlpha = fillOpacity / 100;
        }

        // we only want to put volume on own shorter axis when rendered with price
        if (mode !== VizDisplayMode.Volume) {
          volumeField.config = { ...volumeField.config };
          volumeField.config.unit = 'short';
          volumeField.display = getDisplayProcessor({
            field: volumeField,
            theme: config.theme2,
          });

          tweakAxis = (opts: AxisProps, forField: Field) => {
            // we can't do forField === info.volume because of copies :(
            if (forField.name === info.volume?.name) {
              let filter = (u: uPlot, splits: number[]) => {
                let _splits = [];
                let max = u.series[volumeIdx].max;

                for (let i = 0; i < splits.length; i++) {
                  _splits.push(splits[i]);

                  if (max && splits[i] > max) {
                    break;
                  }
                }

                return _splits;
              };

              opts.space = 20; // reduce tick spacing
              opts.filter = filter; // hide tick labels
              opts.ticks = { ...opts.ticks, filter }; // hide tick marks
            }

            return opts;
          };

          tweakScale = (opts: ScaleProps, forField: Field) => {
            // we can't do forField === info.volume because of copies :(
            if (forField.name === info.volume?.name) {
              opts.range = (u: uPlot, min: number, max: number) => [0, max * 7];
            }

            return opts;
          };
        }
      }
    }

    let shouldRenderPrice = mode !== VizDisplayMode.Volume && high != null && low != null;

    if (!shouldRenderPrice && !shouldRenderVolume) {
      return doNothing;
    }

    let fields: Record<string, string> = {};
    let indicesOnly = [];

    if (shouldRenderPrice) {
      fields = { open, high: high!, low: low!, close };
    } else {
      // these fields should not be omitted from normal rendering if they arent rendered
      // as part of price markers. they're only here so we can get back their indicies in the
      // init callback below. TODO: remove this when field mapping happens in the panel instead of deep
      indicesOnly.push(open, close);
    }

    if (shouldRenderVolume) {
      fields.volume = volume!;
      fields.open = open;
      fields.close = close;
    }

    return {
      shouldRenderPrice,
      renderers: [
        {
          fieldMap: fields,
          indicesOnly,
          init: (builder: UPlotConfigBuilder, fieldIndices: FieldIndices) => {
            volumeIdx = fieldIndices.volume!;

            builder.addHook(
              'drawAxes',
              drawMarkers({
                mode,
                fields: fieldIndices,
                upColor: config.theme2.visualization.getColorByName(colors.up),
                downColor: config.theme2.visualization.getColorByName(colors.down),
                flatColor: config.theme2.visualization.getColorByName(colors.flat),
                volumeAlpha,
                colorStrategy,
                candleStyle,
                flatAsUp: true,
              })
            );
          },
        },
      ],
      tweakScale,
      tweakAxis,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, data.structureRev, data.series.length]);

  if (!info) {
    return (
      <PanelDataErrorView
        panelId={id}
        fieldConfig={fieldConfig}
        data={data}
        needsTimeField={true}
        needsNumberField={true}
      />
    );
  }

  if (shouldRenderPrice) {
    // hide series from legend that are rendered as composite markers
    for (let key in renderers[0].fieldMap) {
      let field: Field = (info as any)[key];
      field.config = {
        ...field.config,
        custom: {
          ...field.config.custom,
          hideFrom: { legend: true, tooltip: false, viz: false },
        },
      };
    }
  }

  const enableAnnotationCreation = Boolean(canAddAnnotations && canAddAnnotations());
  const showNewVizTooltips =
    config.featureToggles.newVizTooltips && (sync == null || sync() !== DashboardCursorSync.Tooltip);

  return (
    <TimeSeries
      frames={[info.frame]}
      structureRev={data.structureRev}
      timeRange={timeRange}
      timeZone={timeZone}
      width={width}
      height={height}
      legend={options.legend}
      renderers={renderers}
      tweakAxis={tweakAxis}
      tweakScale={tweakScale}
      options={options}
    >
      {(uplotConfig, alignedDataFrame) => {
        alignedDataFrame.fields.forEach((field) => {
          field.getLinks = getLinksSupplier(
            alignedDataFrame,
            field,
            field.state!.scopedVars!,
            replaceVariables,
            timeZone
          );
        });

        return (
          <>
            {showNewVizTooltips ? (
              <TooltipPlugin2
                config={uplotConfig}
                hoverMode={
                  options.tooltip.mode === TooltipDisplayMode.Single ? TooltipHoverMode.xOne : TooltipHoverMode.xAll
                }
                queryZoom={onChangeTimeRange}
                clientZoom={true}
                render={(u, dataIdxs, seriesIdx, isPinned = false, dismiss, timeRange2, viaSync) => {
                  if (viaSync) {
                    return null;
                  }

                  if (enableAnnotationCreation && timeRange2 != null) {
                    setNewAnnotationRange(timeRange2);
                    dismiss();
                    return;
                  }

                  const annotate = () => {
                    let xVal = u.posToVal(u.cursor.left!, 'x');

                    setNewAnnotationRange({ from: xVal, to: xVal });
                    dismiss();
                  };

                  return (
                    <TimeSeriesTooltip
                      frames={[info.frame]}
                      seriesFrame={alignedDataFrame}
                      dataIdxs={dataIdxs}
                      seriesIdx={seriesIdx}
                      mode={options.tooltip.mode}
                      isPinned={isPinned}
                      annotate={enableAnnotationCreation ? annotate : undefined}
                    />
                  );
                }}
                maxWidth={options.tooltip.maxWidth}
                maxHeight={options.tooltip.maxHeight}
              />
            ) : (
              <>
                <ZoomPlugin config={uplotConfig} onZoom={onChangeTimeRange} withZoomY={true} />
                <TooltipPlugin
                  data={alignedDataFrame}
                  config={uplotConfig}
                  mode={TooltipDisplayMode.Multi}
                  sync={sync}
                  timeZone={timeZone}
                />
              </>
            )}
            {/* Renders annotation markers*/}
            {showNewVizTooltips ? (
              <AnnotationsPlugin2
                annotations={data.annotations ?? []}
                config={uplotConfig}
                timeZone={timeZone}
                newRange={newAnnotationRange}
                setNewRange={setNewAnnotationRange}
              />
            ) : (
              data.annotations && (
                <AnnotationsPlugin annotations={data.annotations} config={uplotConfig} timeZone={timeZone} />
              )
            )}
            {/* Enables annotations creation*/}
            {!showNewVizTooltips ? (
              enableAnnotationCreation ? (
                <AnnotationEditorPlugin data={alignedDataFrame} timeZone={timeZone} config={uplotConfig}>
                  {({ startAnnotating }) => {
                    return (
                      <ContextMenuPlugin
                        data={alignedDataFrame}
                        config={uplotConfig}
                        timeZone={timeZone}
                        replaceVariables={replaceVariables}
                        defaultItems={
                          enableAnnotationCreation
                            ? [
                                {
                                  items: [
                                    {
                                      label: 'Add annotation',
                                      ariaLabel: 'Add annotation',
                                      icon: 'comment-alt',
                                      onClick: (e, p) => {
                                        if (!p) {
                                          return;
                                        }
                                        startAnnotating({ coords: p.coords });
                                      },
                                    },
                                  ],
                                },
                              ]
                            : []
                        }
                      />
                    );
                  }}
                </AnnotationEditorPlugin>
              ) : (
                <ContextMenuPlugin
                  data={alignedDataFrame}
                  config={uplotConfig}
                  timeZone={timeZone}
                  replaceVariables={replaceVariables}
                  defaultItems={[]}
                />
              )
            ) : undefined}
            {data.annotations && (
              <ExemplarsPlugin config={uplotConfig} exemplars={data.annotations} timeZone={timeZone} />
            )}

            {((canEditThresholds && onThresholdsChange) || showThresholds) && (
              <ThresholdControlsPlugin
                config={uplotConfig}
                fieldConfig={fieldConfig}
                onThresholdsChange={canEditThresholds ? onThresholdsChange : undefined}
              />
            )}

            <OutsideRangePlugin config={uplotConfig} onChangeTimeRange={onChangeTimeRange} />
          </>
        );
      }}
    </TimeSeries>
  );
};
