#!/usr/bin/env node

import {StackOutput} from "@aws-cdk/pipelines";

import { App } from '@aws-cdk/core';
import { RequestLoggerStack } from './lib/lambda-stack';
import { PipelineStack } from './lib/pipeline-stack';

const app = new App();

const lambdaStack = new RequestLoggerStack(app, 'LambdaStack');
const pipeline = new PipelineStack(app, 'PipelineStack', {
    lambdaArtifactParam: lambdaStack.codeArtifact,
    lambdaUrl: lambdaStack.apiUrl,
});

app.synth();
