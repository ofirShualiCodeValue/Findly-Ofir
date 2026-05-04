import { Includeable } from 'sequelize';
import { Entity } from '@monkeytech/nodejs-core/api/entities/Entity';
import { Request } from 'express';
import { User } from '../../../../../models/User';
import { EmployeeProfile } from '../../../../../models/EmployeeProfile';
import { Industry } from '../../../../../models/Industry';
import { IndustrySubCategory } from '../../../../../models/IndustrySubCategory';
import { Certification } from '../../../../../models/Certification';

class IndustryEntity extends Entity<Industry> {
  get id() {
    return this.instance.id;
  }
  get name() {
    return this.instance.name;
  }
  get slug() {
    return this.instance.slug;
  }
}

class IndustrySubCategoryEntity extends Entity<IndustrySubCategory> {
  get id() {
    return this.instance.id;
  }
  get industryId() {
    return this.instance.industryId;
  }
  get name() {
    return this.instance.name;
  }
  get slug() {
    return this.instance.slug;
  }
}

class CertificationEntity extends Entity<Certification> {
  get id() {
    return this.instance.id;
  }
  get name() {
    return this.instance.name;
  }
  get slug() {
    return this.instance.slug;
  }
}

export class EmployeeProfileFullEntity extends Entity<User> {
  get id() {
    return this.instance.id;
  }

  get fullName() {
    return this.instance.fullName;
  }

  get firstName() {
    return this.instance.firstName;
  }

  get lastName() {
    return this.instance.lastName;
  }

  get phone() {
    return this.instance.phone;
  }

  get email() {
    return this.instance.email;
  }

  get role() {
    return this.instance.role;
  }

  get status() {
    return this.instance.status;
  }

  get notifications() {
    return {
      email: this.instance.notifyEmail,
      sms: this.instance.notifySms,
      push: this.instance.notifyPush,
    };
  }

  get profile() {
    const p = this.instance.employeeProfile;
    if (!p) return null;
    return {
      id_number: p.idNumber,
      bank_account_number: p.bankAccountNumber,
      bank_branch: p.bankBranch,
      bank_name: p.bankName,
      date_of_birth: p.dateOfBirth,
      work_status: p.workStatus,
      avatar_url: p.avatarUrl,
      location_range_km: p.locationRangeKm,
      base_hourly_rate: p.baseHourlyRate,
      home_city: p.homeCity,
      home_latitude: p.homeLatitude,
      home_longitude: p.homeLongitude,
      is_complete: isProfileComplete(p),
    };
  }

  get industries() {
    return (this.instance.industries || []).map(
      (i) => new IndustryEntity(i, this.context),
    );
  }

  get industrySubCategories() {
    return (this.instance.industrySubCategories || []).map(
      (s) => new IndustrySubCategoryEntity(s, this.context),
    );
  }

  get certifications() {
    return (this.instance.certifications || []).map(
      (c) => new CertificationEntity(c, this.context),
    );
  }

  get createdAt() {
    return this.instance.createdAt;
  }

  static includes(_context: Request): Includeable[] {
    return [
      { model: EmployeeProfile },
      { model: Industry, through: { attributes: [] } },
      { model: IndustrySubCategory, through: { attributes: [] } },
      { model: Certification, through: { attributes: [] } },
    ];
  }
}

function isProfileComplete(p: EmployeeProfile): boolean {
  return Boolean(
    p.dateOfBirth &&
      p.workStatus &&
      p.locationRangeKm !== null &&
      p.baseHourlyRate &&
      p.homeLatitude !== null &&
      p.homeLongitude !== null,
  );
}
