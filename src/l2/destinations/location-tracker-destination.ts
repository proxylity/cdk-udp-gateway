import * as iam from 'aws-cdk-lib/aws-iam';
import * as location from 'aws-cdk-lib/aws-location';
import { Construct } from 'constructs';
import { CommonDestinationProps, DestinationBase, ListenerDestinationConfig } from '../destination';
import { Formatter, LocationTimeUnit } from '../enums';
import { Listener } from '../listener';
import { toDotNetTimeSpan } from '../../private/l2-iam';

/**
 * Properties for {@link LocationTrackerDestination}. Provide exactly one of {@link tracker} (the L1
 * {@link location.CfnTracker}) or {@link trackerArn}. The device/latitude/longitude expressions are
 * required.
 */
export interface LocationTrackerDestinationProps extends CommonDestinationProps {
  /** The tracker (L1 resource) positions are written to. Mutually exclusive with {@link trackerArn}. */
  readonly tracker?: location.CfnTracker;
  /** The tracker ARN. Mutually exclusive with {@link tracker}. */
  readonly trackerArn?: string;
  /** `Arguments.DeviceIdExpression` — a BREX expression yielding the device id (required). */
  readonly deviceIdExpression: string;
  /** `Arguments.LatitudeExpression` — a BREX expression yielding the latitude (required). */
  readonly latitudeExpression: string;
  /** `Arguments.LongitudeExpression` — a BREX expression yielding the longitude (required). */
  readonly longitudeExpression: string;
  /** `Arguments.ScaleFactor`. */
  readonly scaleFactor?: number;
  /** `Arguments.AccuracyExpression`. */
  readonly accuracyExpression?: string;
  /** `Arguments.PositionPropertyExpressions` — up to 3 named BREX expressions. */
  readonly positionPropertyExpressions?: { [name: string]: string };
  /** `Arguments.TimestampExpression`. */
  readonly timestampExpression?: string;
  /**
   * `Arguments.TimeUnit` — the unit for {@link timestampExpression}. May be accepted but not yet
   * honored by the service; do not rely on it to change timestamp interpretation for now.
   */
  readonly timeUnit?: LocationTimeUnit;
}

/**
 * Deliver packets to an AWS Location Service tracker. The derived role trusts the Proxylity
 * ServiceRole and grants `geo:BatchUpdateDevicePosition` on the tracker ARN. Device, latitude and
 * longitude expressions are required.
 */
export class LocationTrackerDestination extends DestinationBase {
  constructor(private readonly props: LocationTrackerDestinationProps) {
    super(props);
  }

  public bind(scope: Construct, listener: Listener): ListenerDestinationConfig {
    this.validate();
    const arn = this.resolveArn();
    const { role, dependencies } = this._resolveRole(
      scope,
      'LocationTrackerDestinationRole',
      listener,
      (r) => {
        r.addToPrincipalPolicy(
          new iam.PolicyStatement({
            actions: ['geo:BatchUpdateDevicePosition'],
            resources: [arn],
          }),
        );
      },
    );

    return {
      destinationArn: arn,
      role,
      formatter: this.props.formatter ?? Formatter.BASE64,
      destinationName: this.props.destinationName,
      description: this.props.description,
      batching: this.props.batching,
      filterExpression: this.props.filterExpression,
      metricsEnabled: this.props.metricsEnabled,
      logGroupName: this.props.logGroupName,
      roleSessionDuration: toDotNetTimeSpan(this.props.roleSessionDuration),
      arguments: {
        deviceIdExpression: this.props.deviceIdExpression,
        latitudeExpression: this.props.latitudeExpression,
        longitudeExpression: this.props.longitudeExpression,
        scaleFactor: this.props.scaleFactor,
        accuracyExpression: this.props.accuracyExpression,
        positionPropertyExpressions: this.props.positionPropertyExpressions,
        timestampExpression: this.props.timestampExpression,
        timeUnit: this.props.timeUnit,
      },
      dependencies,
    };
  }

  private validate(): void {
    if (
      !this.props.deviceIdExpression ||
      !this.props.latitudeExpression ||
      !this.props.longitudeExpression
    ) {
      throw new Error(
        'DeviceIdExpression, LatitudeExpression and LongitudeExpression are required for AWS ' +
          'Location Tracker destinations.',
      );
    }
    if (
      this.props.positionPropertyExpressions !== undefined &&
      Object.keys(this.props.positionPropertyExpressions).length > 3
    ) {
      throw new Error(
        'PositionPropertyExpressions supports at most 3 entries for AWS Location Tracker ' +
          'destinations.',
      );
    }
    if (
      this.props.timeUnit !== undefined &&
      this.props.timeUnit !== LocationTimeUnit.SECONDS &&
      this.props.timeUnit !== LocationTimeUnit.MILLISECONDS
    ) {
      throw new Error("When present, TimeUnit must be one of 'seconds' or 'milliseconds.'");
    }
  }

  private resolveArn(): string {
    const hasTracker = this.props.tracker !== undefined;
    const hasArn = this.props.trackerArn !== undefined;
    if (hasTracker === hasArn) {
      throw new Error(
        "LocationTrackerDestination requires exactly one of 'tracker' or 'trackerArn'.",
      );
    }
    return hasTracker ? this.props.tracker!.attrArn : this.props.trackerArn!;
  }
}
