import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class LanguageSkillDto {
    @ApiProperty({ example: 'german' })
    @IsString()
    @Transform(({ value }) => value?.trim().toLowerCase())
    readonly language: string;

    @ApiProperty({ enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'], example: 'B2' })
    @IsIn(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native'])
    readonly level: string;
}

export class MatchingProfileDto {
    @ApiProperty({ required: false, type: [String] })
    @IsOptional()
    @IsArray()
    readonly hobbies?: string[];

    @ApiProperty({ required: false, type: [String] })
    @IsOptional()
    @IsArray()
    readonly interests?: string[];

    @ApiProperty({ required: false, type: [LanguageSkillDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LanguageSkillDto)
    readonly spokenLanguages?: LanguageSkillDto[];

    @ApiProperty({ required: false, type: [LanguageSkillDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LanguageSkillDto)
    readonly learningLanguages?: LanguageSkillDto[];

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly motherTongue?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly learningLanguage?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    readonly semester?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly courseOfStudy?: string;

    @ApiProperty({ required: false, type: [String] })
    @IsOptional()
    @IsArray()
    readonly availableDays?: string[];
}

export class UpdateUserDto {
    @ApiProperty()
    @IsOptional()
    @IsString()
    readonly firstName: string;
    @ApiProperty()
    @IsOptional()
    @IsString()
    readonly lastName: string;
    @ApiProperty()
    @IsOptional()
    @IsString()
    @Transform(({ value }) => value.toLowerCase())
    readonly username: string;

    @ApiProperty()
    @IsOptional()
    @IsEmail()
    @Transform(({ value }) => value.toLowerCase())
    readonly recoveryEmail: string;

    @ApiProperty()
    @IsOptional()
    @IsString()
    readonly profilePicture: string;
    /// TODO Shayan : Implement email validation against institution domains
    @ApiProperty({ required: false, example: 'HHN - Hochschule Heilbronn' })
    @IsOptional()
    @IsString()
    readonly institution?: string;
    @IsOptional()
    @ApiProperty({ required: false })
    @IsArray()
    readonly interestedTags: string[];
    @IsOptional()
    @ApiProperty({ required: false })
    @IsArray()
    readonly interestedCourses: string[];
    @IsOptional()
    @ApiProperty({ required: false })
    @IsArray()
    readonly studyPrograms: string[];

    // TODO is SH: Add overview field for profile settings updates
    // Optional, max 500 chars, trimmed automatically
    @ApiProperty({ 
        required: false, 
        description: 'User bio/overview (max 500 characters)',
        maxLength: 500 
    })
    @IsOptional()
    @IsString()
    @MaxLength(500, { message: 'Overview must not exceed 500 characters' })
    @Transform(({ value }) => value?.trim())
    readonly overview?: string;

    @ApiProperty({ required: false, type: MatchingProfileDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => MatchingProfileDto)
    readonly matchingProfile?: MatchingProfileDto;

}
