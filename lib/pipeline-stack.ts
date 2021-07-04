import * as cdk from '@aws-cdk/core';
import {App, StackProps} from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as lambda from '@aws-cdk/aws-lambda';

export interface PipelineStackProps extends StackProps {
    readonly lambdaArtifact: lambda.CfnParametersCode;
    readonly repoName: string
}

export class PipelineStack extends cdk.Stack {
    constructor(app: App, id: string, props: PipelineStackProps) {
        super(app, id, props);
        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {});

        const cdkRepo = codecommit.Repository.fromRepositoryName(this, 'PipelineRepository', 'pipeline');
        const cdkSource = new codepipeline.Artifact();
        const lambdaRepo = codecommit.Repository.fromRepositoryName(this, 'RequestLoggerRepository', 'request-logger');
        const lambdaSource = new codepipeline.Artifact();

        pipeline.addStage(
            {
                stageName: 'Source-CDK',
                actions: [
                    new codepipeline_actions.CodeCommitSourceAction({
                        actionName: 'CodeCommit_Source',
                        branch: 'main',
                        repository: cdkRepo,
                        output: cdkSource,
                    }),
                    new codepipeline_actions.CodeCommitSourceAction({
                        actionName: 'CodeCommit_Lambda',
                        branch: 'main',
                        repository: lambdaRepo,
                        output: lambdaSource,
                    }),
                ],
            })

        const cdkBuildScript = this.createCdkBuild()
        const cdkArtifact = new codepipeline.Artifact('CdkBuildOutput');

        pipeline.addStage({
                stageName: 'Build-CDK',
                actions: [
                    new codepipeline_actions.CodeBuildAction({
                        actionName: 'CDK_Build',
                        project: cdkBuildScript,
                        input: cdkSource,
                        outputs: [cdkArtifact],
                    }),
                ],
            }
        )
        pipeline.addStage({
            stageName: 'Deploy-Pipeline',
            actions: [
                new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                    actionName: 'PipelineSelfMutation',
                    templatePath: cdkArtifact.atPath('PipelineStack.template.json'),
                    stackName: 'PipelineStack',
                    adminPermissions: true,
                }),
            ],
        })

        const lambdaBuild = this.createLambdaBuild()
        const lambdaArtifact = new codepipeline.Artifact('LambdaBuildOutput');

        pipeline.addStage({
                stageName: 'Build-Lambda',
                actions: [
                    new codepipeline_actions.CodeBuildAction({
                        actionName: 'Lambda_Build',
                        project: lambdaBuild,
                        input: lambdaSource,
                        outputs: [lambdaArtifact],
                    }),
                ],
            }
        )
        pipeline.addStage({
            stageName: 'Deploy-Application',
            actions: [
                new codepipeline_actions.CloudFormationCreateUpdateStackAction({
                    actionName: 'Lambda_CFN_Deploy',
                    templatePath: cdkArtifact.atPath('LambdaStack.template.json'),
                    stackName: 'LambdaDeploymentStack',
                    adminPermissions: true,
                    parameterOverrides: {
                        ...props.lambdaArtifact.assign(lambdaArtifact.s3Location),
                    },
                    extraInputs: [lambdaArtifact],
                }),
            ],
        })
    }

    private createCdkBuild(): codebuild.PipelineProject {
        return new codebuild.PipelineProject(this, 'CdkBuild', {
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: './bin/install',
                    },
                    build: {
                        commands: './bin/release',
                    },
                },
                artifacts: {
                    'base-directory': 'dist',
                    files: [
                        'PipelineStack.template.json',
                        'LambdaStack.template.json',
                    ],
                },
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
            },
        });
    }


    private createLambdaBuild(): codebuild.PipelineProject {
        return new codebuild.PipelineProject(this, 'LambdaBuild', {
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: './bin/install',
                    },
                    build: {
                        commands: './bin/release',
                    },
                },
                artifacts: {
                    'base-directory': '.',
                    files: ['main'],
                },
            }),
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
            },
        });
    }
}