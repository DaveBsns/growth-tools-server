import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'native';

@Schema({ _id: false })
export class LanguageSkill {
    @Prop({ required: true, trim: true, lowercase: true })
    language: string;

    @Prop({ required: true, enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'] })
    level: LanguageLevel;
}

export const LanguageSkillSchema = SchemaFactory.createForClass(LanguageSkill);

@Schema({ _id: false })
export class MatchingProfile {
    @Prop({ type: [String], default: [] })
    hobbies: string[];

    @Prop({ type: [String], default: [] })
    interests: string[];

    @Prop({ type: [LanguageSkillSchema], default: [] })
    spokenLanguages: LanguageSkill[];

    @Prop({ type: [LanguageSkillSchema], default: [] })
    learningLanguages: LanguageSkill[];

    @Prop({ required: false })
    semester: number;

    @Prop({ required: false })
    courseOfStudy: string;

    @Prop({ type: [String], default: [] })
    availableDays: string[];
}

export const MatchingProfileSchema = SchemaFactory.createForClass(MatchingProfile);

@Schema({ _id: false })
export class MatchingResultRef {
    @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
    partnerId: Types.ObjectId;

    @Prop({ required: true })
    score: number;

    @Prop({ required: false })
    rank?: number;

    @Prop({ required: false })
    llmSummary?: string;
}

export const MatchingResultRefSchema = SchemaFactory.createForClass(MatchingResultRef);

@Schema({ timestamps: true })
export class User {
    @Prop({ required: true })
    firstName: string;

    @Prop({ required: true })
    lastName: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop({ required: false, default: '' })
    recoveryEmail?: string;

    @Prop({ required: false })
    username: string;

    @Prop({ required: true, select: false })
    password: string;

    @Prop({ default: false })
    status: boolean;

    @Prop({ type: String, required: true })
    userType: 'student' | 'lecturer';
    // TODO Shayan : Implement email validation against institution domains
    @Prop({ type: String, required: false, trim: true })
    institution?: string;

    @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Upload', required: false })
    profilePicture: Types.ObjectId;

    // TODO is SH: Add overview field to store user bio/description (max 500 chars)
    // This is optional and nullable, supporting Registration Step 3 and Profile Settings
    @Prop({ required: false, type: String, maxlength: 500, default: null })
    overview?: string;

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }], default: [] })
    interestedTags: Types.ObjectId[];

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }], default: [] })
    interestedCourses: Types.ObjectId[];

    @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }], default: [] })
    studyPrograms: Types.ObjectId[];

    @Prop({ require: false, select: false })
    code: string;

    @Prop({ require: false, select: false })
    codeExpire: Date;

    @Prop({ default: false })
    isBlockedByAdmin: boolean;

    @Prop({ default: false, select: false })
    softDeleted: boolean;

    @Prop({ type: Boolean, default: false, select: false })
    isMockData: boolean;

    @Prop({ type: MatchingProfileSchema, required: false })
    matchingProfile?: MatchingProfile;

    @Prop({ type: [MatchingResultRefSchema], default: [] })
    matchingResults?: MatchingResultRef[];
}

export const UserSchema = SchemaFactory.createForClass(User);

