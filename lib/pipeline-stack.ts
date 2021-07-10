import * as cdk from '@aws-cdk/core';
import {App, CfnOutput, Fn, Stack, StackProps} from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codecommit from '@aws-cdk/aws-codecommit';
import {IRepository} from '@aws-cdk/aws-codecommit';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as lambda from '@aws-cdk/aws-lambda';

export interface PipelineStackProps extends StackProps {
    readonly lambdaArtifactParam: lambda.CfnParametersCode;
    readonly lambdaUrl: CfnOutput
}

export class PipelineStack extends cdk.Stack {
    constructor(app: App, id: string, props: PipelineStackProps) {
        super(app, id, props);
        const cdkRepo = codecommit.Repository.fromRepositoryName(this, 'PipelineRepository', 'pipeline');
        const lambdaRepo = codecommit.Repository.fromRepositoryName(this, 'RequestLoggerRepository', 'request-logger');

        const pipelineMutation = createPipelineUpdater(this, cdkRepo)
        const applicationDeployment = createLambdaPipeline(this, cdkRepo, lambdaRepo, props)
    }
}

function createPipelineUpdater(stack: Stack, cdkRepo: IRepository) {
    const cdkSource = new codepipeline.Artifact();
    const cdkArtifact = new codepipeline.Artifact('CdkBuildOutput');

    const sourceCdkPipelineCode = new codepipeline_actions.CodeCommitSourceAction({
        actionName: 'CodeCommit_CDK',
        branch: 'main',
        repository: cdkRepo,
        output: cdkSource,
    });

    const compileAndSynthCdk = new codepipeline_actions.CodeBuildAction({
        actionName: 'PipelineSynth',
        project: new codebuild.PipelineProject(stack, 'PipelineSynthScript', createCdkBuild()),
        input: cdkSource,
        outputs: [cdkArtifact],
    });

    const deployPipelines = new codepipeline_actions.CloudFormationCreateUpdateStackAction({
        actionName: 'Deploy',
        templatePath: cdkArtifact.atPath('PipelineStack.template.json'),
        stackName: 'PipelineStack',
        adminPermissions: true,
    });

    //////////////////////////
    const pipeline = new codepipeline.Pipeline(stack, 'Pipeline', {
        pipelineName: "PipelineMutation",
    });

    pipeline.addStage({
        stageName: 'Source',
        actions: [sourceCdkPipelineCode],
    })

    pipeline.addStage({
        stageName: 'Build',
        actions: [compileAndSynthCdk],
    })

    pipeline.addStage({
        stageName: 'Deploy',
        actions: [deployPipelines],
    })
}

function createLambdaPipeline(stack: Stack, cdkRepo: IRepository, lambdaRepo: IRepository, props: PipelineStackProps) {
    const cdkSource = new codepipeline.Artifact();
    const lambdaSource = new codepipeline.Artifact();
    const cdkArtifact = new codepipeline.Artifact('CdkBuildOutput');
    const lambdaArtifact = new codepipeline.Artifact('LambdaBuildOutput');

    const sourceCdkPipelineCode = new codepipeline_actions.CodeCommitSourceAction({
        actionName: 'CodeCommit_Source',
        branch: 'main',
        repository: cdkRepo,
        output: cdkSource,
    });

    const sourceRequestLoggerCode = new codepipeline_actions.CodeCommitSourceAction({
        actionName: 'CodeCommit_Lambda',
        branch: 'main',
        repository: lambdaRepo,
        output: lambdaSource,
    });

    const compileAndSynthCDK = new codepipeline_actions.CodeBuildAction({
        actionName: 'CDK_Build',
        project: new codebuild.PipelineProject(stack, 'CDK_BuildScript', createCdkBuild()),
        input: cdkSource,
        outputs: [cdkArtifact],
    });

    const compileRequestLogger = new codepipeline_actions.CodeBuildAction({
        actionName: 'RequestLogger_Build',
        project: new codebuild.PipelineProject(stack, 'RequestLogger_BuildScript',  createLambdaBuild()),
        input: lambdaSource,
        outputs: [lambdaArtifact],
    });

    const updateRequestLoggerStack = new codepipeline_actions.CloudFormationCreateUpdateStackAction({
        actionName: 'Lambda_CFN_Deploy',
        templatePath: cdkArtifact.atPath('LambdaStack.template.json'),
        stackName: 'LambdaDeploymentStack',
        adminPermissions: true,
        parameterOverrides: {
            ...props.lambdaArtifactParam.assign(lambdaArtifact.s3Location),
        },
        extraInputs: [lambdaArtifact],
    });

    const verifyLambda = new codepipeline_actions.CodeBuildAction({
        actionName: 'Lambda_Verify',
        project: new codebuild.PipelineProject(stack, 'Lambda_VerifyScript', createLambdaVerify(props.lambdaUrl)),
        input: lambdaSource,
        outputs: [],
    });

    ////////////////////////////////////////////////////////////////////////////////////////
    const pipeline = new codepipeline.Pipeline(stack, 'RequestLoggerPipeline', {
        pipelineName: "RequestLoggerPipeline"
    });

    pipeline.addStage({
        stageName: 'Source',
        actions: [sourceCdkPipelineCode, sourceRequestLoggerCode],
    })

    pipeline.addStage({
        stageName: 'Build',
        actions: [compileAndSynthCDK, compileRequestLogger],
    })

    pipeline.addStage({
        stageName: 'Deploy',
        actions: [updateRequestLoggerStack],
    })

    pipeline.addStage({
        stageName: 'Verify',
        actions: [verifyLambda],
    });
}

function createLambdaBuild(): codebuild.PipelineProjectProps {
    return {
        buildSpec: codebuild.BuildSpec.fromObject({
            version: '0.2',
            phases: {
                install: {
                    commands: ['ls', 'ls bin', 'bash ./bin/install'],
                },
                build: {
                    commands: 'bash ./bin/release',
                },
            },
            artifacts: {
                'base-directory': 'build',
                files: ['main'],
            },
        }),
        environment: {
            buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        },
    };
}

function createLambdaVerify(url: CfnOutput): codebuild.PipelineProjectProps {
    return {
        buildSpec: codebuild.BuildSpec.fromObject({
            version: '0.2',
            phases: {
                install: {
                    commands: ['bash ./bin/install'],
                },
                build: {
                    // Initial deploy will fail, requiring this import to be hidden, due to
                    // the circular dependency it creates.
                    commands: `bash ./bin/verify ${Fn.importValue(url.exportName!)}`,
                },
            },
            artifacts: {
                'base-directory': 'build',
                files: [],
            },
        }),
        environment: {
            buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        },
    };
}

function createCdkBuild(): codebuild.PipelineProjectProps {
    return {
        buildSpec: codebuild.BuildSpec.fromObject({
            version: '0.2',
            phases: {
                install: {
                    commands: ['ls', 'bash ./bin/install'],
                },
                build: {
                    commands: 'bash ./bin/release',
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
    };
}