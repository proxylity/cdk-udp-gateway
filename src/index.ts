// Proxylity UDP Gateway — L1 (CloudFormation-faithful) CDK construct library.
//
// NOTE: there is intentionally NO `CfnDestination` export. The service does not currently implement
// a standalone `Custom::ProxylityUdpGatewayDestination` resource, so such a resource would always
// fail at deploy. Destinations are created inline via `CfnListener.destinations` (see
// `ListenerDestination`). It may be added if the service implements the type.

export * from './proxylity-config';
export * from './cfn-listener';
export * from './cfn-destination-arn';
export * from './cfn-packet-source';

// L2 (ergonomic) layer. Composed strictly on top of the L1 exports above; see src/l2.
export * from './l2/enums';
export * from './l2/listener-protocol';
export * from './l2/destination';
export * from './l2/listener';
export * from './l2/packet-source';
export * from './l2/regional-arn-registration';

// L2 destinations (the 13 service specializations + the generic ArnDestination escape hatch).
export * from './l2/destinations/lambda-destination';
export * from './l2/destinations/sqs-destination';
export * from './l2/destinations/kinesis-destination';
export * from './l2/destinations/firehose-destination';
export * from './l2/destinations/s3-destination';
export * from './l2/destinations/sns-destination';
export * from './l2/destinations/state-machine-destination';
export * from './l2/destinations/dynamodb-destination';
export * from './l2/destinations/api-gateway-destination';
export * from './l2/destinations/cloudwatch-logs-destination';
export * from './l2/destinations/event-bridge-destination';
export * from './l2/destinations/iot-data-destination';
export * from './l2/destinations/location-tracker-destination';
export * from './l2/destinations/arn-destination';
