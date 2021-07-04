import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as codedeploy from '@aws-cdk/aws-codedeploy';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import * as cwlogs from '@aws-cdk/aws-logs';

export class RequestLoggerStack extends cdk.Stack {
    public readonly codeArtifact: lambda.CfnParametersCode

    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.codeArtifact = lambda.Code.fromCfnParameters();
        const fn = new lambda.Function(this, 'ApplicationFunction', {
            runtime: lambda.Runtime.GO_1_X,
            handler: 'main',
            code: this.codeArtifact,
            functionName: 'request-logger',
        });
        const alias = new lambda.Alias(this, 'LambdaAlias', {
            aliasName: 'Prod',
            version: fn.currentVersion,
        });
        new codedeploy.LambdaDeploymentGroup(this, 'DeploymentGroup', {
            alias,
            deploymentConfig: codedeploy.LambdaDeploymentConfig.LINEAR_10PERCENT_EVERY_1MINUTE,
        });


        const logGroup = new cwlogs.LogGroup(this, "ApiGatewayAccessLogs");
        const api = new apigateway.LambdaRestApi(this, 'FuncGateway', {
            handler: fn,
            cloudWatchRole: true,
            deployOptions: {
                accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
                tracingEnabled: true,
            },
        });

        new cdk.CfnOutput(this, 'lambdaArn', {
            exportName: 'lambdaARN',
            value: fn.functionArn,
        })

        new cdk.CfnOutput(this, 'lambdaUrl', {
            exportName: 'lambdaUrl',
            value: api.url,
        })
    }
}
